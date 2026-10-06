
import { logger } from '@owlmeans/log'
import { CommitState, TransitionAction, type CommitStatus, type Unsubscribe } from '@owlmeans/planning'
import type { PostgresResource } from '@owlmeans/postgres-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import { makeCommitHub, type CommitHub, type CommitListener } from '@owlmeans/server-planning/store'
import type { Pool } from 'pg'
import {
  DEFAULT_PLANNING_POSTGRES_LIMITS, PLANNING_POSTGRES_STORE, PLANNING_RESOURCE_FILES, RES_PLANNING_CARD,
  RES_PLANNING_LINK, RES_PLANNING_SCHEMA, RES_PLANNING_TRANSITION,
} from '../consts.js'
import { PlanningPostgresError } from '../errors.js'
import { planningIndexName } from '../resource.js'
import { sqlHelper } from '../sql.js'
import type { PlanningTables, SqlContext, PlanningCardResource, PlanningLinkResource, PlanningPostgresAliases, PlanningPostgresLimits, PlanningSchemaResource, PlanningTransitionResource, PostgresPlanningStore, PostgresPlanningStoreOptions } from '../types.js'
import { makePlanningBus } from './bus.js'
import { cardSqlOf } from './card-sql.js'
import { makeCardPort } from './cards.js'
import { makeFoldEngine } from './fold.js'
import { makeLinkPort } from './links.js'
import { makeSchemaPort } from './schemas.js'
import { makeSpecPort } from './specs.js'
import { transitionSqlOf } from './transition-sql.js'
import { makeTransitionPort } from './transitions.js'
import { idHelper } from '@owlmeans/basic-ids'

const log = logger('planning-postgres')

export * from './bus.js'
export type * from './types.js'
export type * from './card-sql/types.js'
export type * from './link-sql/types.js'
export type * from './schema-sql/types.js'
export type * from './transition-sql/types.js'
export * from './card-sql.js'
export * from './link-sql.js'
export * from './schema-sql.js'
export * from './transition-sql.js'
export * from './cards.js'
export * from './consts.js'
export * from './fold.js'
export * from './links.js'
export * from './schemas.js'
export * from './specs.js'
export * from './transitions.js'

const isoNow = (): string => new Date().toISOString()

/** The aliases a store resolves, each defaulting to the package's own resource alias. */
export const planningPostgresAliases = (aliases?: Partial<PlanningPostgresAliases>): PlanningPostgresAliases => ({
  card: aliases?.card ?? RES_PLANNING_CARD,
  transition: aliases?.transition ?? RES_PLANNING_TRANSITION,
  link: aliases?.link ?? RES_PLANNING_LINK,
  schema: aliases?.schema ?? RES_PLANNING_SCHEMA,
})

/**
 * The Postgres `PlanningStore`: four tables, an inline fold (one transaction per card under its
 * advisory lock), the commit hub fed by the fold and by a LISTEN/NOTIFY bus, and the data-defined
 * schema port.
 *
 * Nothing is resolved at construction: the resources are looked up on the context at the first
 * call — which also runs one `recover()` in the background — so the store can be handed to the
 * planning service before the context initializes. A resource the context does not have is refused
 * with the file a target adds for it.
 */
export const makePostgresPlanningStore = (opts: PostgresPlanningStoreOptions): PostgresPlanningStore => {
  const aliases = planningPostgresAliases(opts.aliases)
  const limits: PlanningPostgresLimits = { ...DEFAULT_PLANNING_POSTGRES_LIMITS, ...(opts.limits ?? {}) }
  const ids = opts.ids ?? idHelper.uuid
  const now = opts.now ?? isoNow
  const processId = idHelper.uuid()
  let committed: CommitListener | undefined
  let closed = false

  const resourceOf = <R extends PostgresResource<ResourceRecord>>(kind: keyof PlanningPostgresAliases) => (): R => {
    const context = opts.context()
    const alias = aliases[kind]
    if (context == null) {
      throw new PlanningPostgresError(`context-missing:${alias}`)
    }
    if (!context.hasResource(alias)) {
      throw new PlanningPostgresError(`resource-missing:${alias}: add ${PLANNING_RESOURCE_FILES[kind]}`)
    }
    return context.resource<R>(alias)
  }
  const resources = {
    card: resourceOf<PlanningCardResource>('card'),
    transition: resourceOf<PlanningTransitionResource>('transition'),
    link: resourceOf<PlanningLinkResource>('link'),
    schema: resourceOf<PlanningSchemaResource>('schema'),
  }

  let ready: Promise<PlanningTables> | undefined
  let recovered = false
  const tables = (): Promise<PlanningTables> => {
    ready ??= (async () => {
      const resolved = [resources.card(), resources.transition(), resources.link(), resources.schema()]
      // A resource registered after the context initialized is initialized here, once.
      await Promise.all(resolved.map(async resource => { await resource.queryOne('SELECT 1') }))
      const [card, transition, link, schema] = resolved.map(resource => resource.table)
      return { card, transition, link, schema }
    })()
    const pending = ready
    pending.then(() => {
      if (!recovered && !closed) {
        recovered = true
        void engine.recover().catch(error => {
          if (!closed) {
            log.error('Planning recovery on first use failed', error)
          }
        })
      }
    }, () => {
      // A failed resolution (a missing resource) is asked again by the next call.
      if (ready === pending) {
        ready = undefined
      }
    })
    return pending
  }

  const pool = async (): Promise<Pool> => (await resources.card().db()).pool
  const sql = async (): Promise<SqlContext> => ({ runner: sqlHelper.poolRunner(await pool()), tables: await tables() })

  const schemaWatchers = new Set<(entityId: string) => void>()
  const touched = (entityId: string): void => {
    for (const watcher of [...schemaWatchers]) {
      try {
        watcher(entityId)
      } catch (error) {
        log.error('Planning schema watcher failed', error)
      }
    }
  }

  const bus = makePlanningBus({
    enabled: opts.bus !== false,
    processId,
    table: async () => (await tables()).transition.qualified,
    pool,
  })

  const statusOf = async (transition: string): Promise<CommitStatus | null> => {
    const context = await sql()
    const row = await transitionSqlOf(context).readTransition(transition)
    if (row == null) {
      return null
    }
    const status: CommitStatus = { transition, state: row.commit.state }
    if (row.commit.at != null) {
      status.at = row.commit.at
    }
    if (row.commit.error != null) {
      status.error = row.commit.error
    }
    if (row.commit.state === CommitState.Pending && Date.now() - Date.parse(row.at) > limits.healAfterMs) {
      // Every waiter is a healer: a commit left pending by a lost fold is folded again.
      engine.heal(row.card)
    }
    if (row.commit.state === CommitState.Committed) {
      status.card = row.action === TransitionAction.Delete ? null : await cardSqlOf(context).readCard(row.card, row.entityId)
    }
    return status
  }

  const hub = makeCommitHub({ status: statusOf })
  bus.onCommit(async event => { await hub.publish(event) })
  bus.onSchema(touched)

  const engine = makeFoldEngine({
    pool,
    tables,
    limits,
    ids,
    now,
    bus,
    hub,
    committed: () => committed,
    schemasTouched: touched,
    closed: () => closed,
  })

  const commits: CommitHub = {
    ...hub,
    subscribe: (listener, filter) => {
      bus.ensure()
      return hub.subscribe(listener, filter)
    },
    wait: async (transition, waitOpts) => {
      bus.ensure()
      return await hub.wait(transition, waitOpts)
    },
  }

  const indexes = async () => {
    await tables()
    return {
      cardSeq: planningIndexName(aliases.transition, 'card_seq'),
      entityKey: planningIndexName(aliases.transition, 'entity_key'),
    }
  }

  const store: PostgresPlanningStore = {
    alias: PLANNING_POSTGRES_STORE,
    capabilities: { transitions: true, sync: true, purge: true, revisions: true },
    newId: ids,
    transitions: makeTransitionPort({ sql, resource: resources.transition, ids, now, indexes }),
    cards: makeCardPort({
      sql,
      resource: resources.card,
      project: async card => { await engine.fold(card) },
      purge: engine.purge,
    }),
    specs: makeSpecPort({ sql, resource: resources.card }),
    links: makeLinkPort({ sql, resource: resources.link, ids }),
    commits,
    schemas: makeSchemaPort({
      sql,
      pool,
      tables,
      bus,
      ids,
      now,
      touched,
      watch: listener => {
        bus.ensure()
        schemaWatchers.add(listener)
        const unsubscribe: Unsubscribe = () => { schemaWatchers.delete(listener) }
        return unsubscribe
      },
    }),

    bind: listener => { committed = listener },

    fold: async cardId => await engine.fold(cardId),

    recover: async recoverOpts => await engine.recover(recoverOpts),

    close: async () => {
      closed = true
      await bus.close()
    },
  }

  return store
}
