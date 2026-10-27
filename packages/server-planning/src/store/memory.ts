
import { logger } from '@owlmeans/log'
import {
  CommitState, PlanningResourceKind, PlanningError, queryHelper, SchemaConflict, scopedSchemaHelper, specificationHelper,
  TransitionAction, WorkcardConflict, WorkcardKind,
} from '@owlmeans/planning'
import type {
  Assignee, Team, Comment, CommentMention, PlanningRecord, PlanningRecordStore,
  CommitStatus, ProjectionStore, Relationship, RelationshipStore, RelationshipWhere, SchemaStore,
  ScopedSchemaRecord, ScopedSchemaWhere, Specification, SpecificationStore, Transition, TransitionStore,
  TransitionWhere, Unsubscribe, Workcard,
} from '@owlmeans/planning'
import type { Criteria } from '@owlmeans/resource'
import { MEMORY_STORE_ALIAS } from '../consts.js'
import { makeCommitHub } from './commits.js'
import { foldHelper } from './fold.js'
import type { CommitListener, MemoryPlanningStore, MemoryPlanningStoreOptions } from './types.js'
import { idHelper } from '@owlmeans/basic-ids'
import { recordQueryHelper } from '@owlmeans/resource'

const storeLog = logger('planning:store')

const copy = <T>(value: T): T => structuredClone(value)

const oneOf = <T>(value: T | T[] | undefined, candidate: T): boolean =>
  value == null || (Array.isArray(value) ? value.includes(candidate) : value === candidate)

/**
 * Does a card criteria ask for specifications? A card list leaves them out unless the criteria
 * names `kind: specification` (alone, in a list, or under `$in`/`$eq`) or a `category` — the rule
 * every store routes a list by, whether specifications live apart or in the cards' own table.
 */
export const wantsSpecifications = (where?: Criteria<Workcard>): boolean => {
  const record = (where ?? {}) as Record<string, unknown>
  const kind = record.kind
  if (record.category !== undefined || kind === WorkcardKind.Specification) {
    return true
  }
  if (Array.isArray(kind)) {
    return kind.includes(WorkcardKind.Specification)
  }
  if (kind != null && typeof kind === 'object') {
    const spec = kind as Record<string, unknown>
    return [spec.$in, spec.$eq].some(value => value === WorkcardKind.Specification
      || (Array.isArray(value) && value.includes(WorkcardKind.Specification)))
  }

  return false
}

/**
 * The reference `PlanningStore`, entirely in process memory.
 *
 * Specifications live in their own map (one record per `(parent, category)`, revised in place),
 * cards and projects in another, relationships in a third; every read goes through the
 * `@owlmeans/resource` in-memory query engine, so a criteria means here exactly what it means to a
 * database store. With `sync` (the default) `project()` folds, publishes and runs the bound
 * `committed` before it returns; with `sync: false` nothing folds until `flush()` — the shape of a
 * queued store, for tests that need a commit to stay pending.
 *
 * The service binds `committed` through `bind`, which REPLACES `onCommitted`: one listener per
 * store, so a commit runs the `after` chain once.
 *
 * `schemas: true` adds the data-defined schema port: records keyed by layer, a revision per
 * organization bumped on every write, and `watch` listeners called synchronously. A purged project
 * takes its schema layer with it. A dropped card takes its own documents with it.
 *
 * It is wrong for anything with more than one process or a restart: the log, the cards and the
 * commit feed are all this process's heap.
 */
export const makeMemoryPlanningStore = (opts: MemoryPlanningStoreOptions = {}): MemoryPlanningStore => {
  const ids = opts.ids ?? idHelper.uuid
  const now = opts.now ?? (() => new Date().toISOString())
  const sync = opts.sync !== false
  let committed: CommitListener | undefined = opts.onCommitted

  const log = new Map<string, Transition>()
  const byCard = new Map<string, string[]>()
  const heads = new Map<string, number>()
  const keys = new Map<string, string>()
  const cards = new Map<string, Workcard>()
  const specs = new Map<string, Specification>()
  const links = new Map<string, Relationship>()
  const folding = new Map<string, Promise<unknown>>()
  const assignees = new Map<string, Assignee>()
  const teams = new Map<string, Team>()
  const comments = new Map<string, Comment>()
  const mentions = new Map<string, CommentMention>()
  const units = new Map<string, Promise<unknown>>()
  const resourcePort = <R extends PlanningRecord>(records: Map<string, R>): PlanningRecordStore<R> => ({
    get: async (id, entityId) => records.get(id)?.entityId === entityId ? copy(records.get(id)!) : null,
    list: async (where, options) => { const result = recordQueryHelper.applyQuery([...records.values()], where, options); return { ...result, items: result.items.map(copy) } },
    put: async record => {
      const id = record.id ?? ids()
      const previous = records.get(id)
      if ((previous?.version ?? 0) !== record.version - 1 || (previous != null && previous.entityId !== record.entityId)) throw new WorkcardConflict(`${id}:version:${record.version}`)
      const written = { ...copy(record), id }
      records.set(id, written)
      return copy(written)
    },
    drop: async (id, entityId, version) => {
      const previous = records.get(id)
      if (previous?.entityId !== entityId || previous.version !== version) throw new WorkcardConflict(`${id}:version:${version}`)
      records.delete(id)
    },
  })

  const keyOf = (entityId: string, key: string): string => `${entityId}\0${key}`

  const withHead = <T extends Workcard>(record: T): T => {
    const result = copy(record)
    const head = Math.max(record.head ?? record.seq, heads.get(record.id!) ?? 0)
    if (head > 0) {
      result.head = head
    }
    return result
  }

  const recordOf = (id: string): Workcard | undefined => cards.get(id) ?? specs.get(id)

  /** A record's own documents: the specifications whose primary parent is it, and theirs in turn. */
  const documentsOf = (id: string, entityId: string): Set<string> => {
    const owners = new Set([id])
    let grown = true
    while (grown) {
      grown = false
      for (const spec of specs.values()) {
        if (spec.entityId === entityId && spec.parent != null && owners.has(spec.parent) && !owners.has(spec.id!)) {
          owners.add(spec.id!)
          grown = true
        }
      }
    }
    owners.delete(id)

    return owners
  }

  const logOf = (card: string): Transition[] => (byCard.get(card) ?? [])
    .map(id => log.get(id))
    .filter((transition): transition is Transition => transition != null)

  const remember = (transition: Transition): void => {
    log.set(transition.id!, transition)
    const list = byCard.get(transition.card) ?? []
    if (!list.includes(transition.id!)) {
      list.push(transition.id!)
      byCard.set(transition.card, list)
    }
    heads.set(transition.card, Math.max(heads.get(transition.card) ?? 0, transition.seq))
    if (transition.key != null) {
      keys.set(keyOf(transition.entityId, transition.key), transition.id!)
    }
  }

  const forget = (id: string): void => {
    const transition = log.get(id)
    if (transition == null) {
      return
    }
    log.delete(id)
    if (transition.key != null && keys.get(keyOf(transition.entityId, transition.key)) === id) {
      keys.delete(keyOf(transition.entityId, transition.key))
    }
    const list = (byCard.get(transition.card) ?? []).filter(entry => entry !== id)
    if (list.length > 0) {
      byCard.set(transition.card, list)
    } else {
      byCard.delete(transition.card)
      heads.delete(transition.card)
    }
  }

  const matchesTransition = (transition: Transition, where: TransitionWhere): boolean =>
    transition.entityId === where.entityId
    && oneOf(where.card, transition.card)
    && (where.project == null || (transition.project != null && oneOf(where.project, transition.project)))
    && (where.sinceSeq == null || transition.seq > where.sinceSeq)
    && (where.state == null || transition.commit.state === where.state)
    && oneOf(where.action, transition.action)

  const matchesLink = (link: Relationship, where: RelationshipWhere): boolean =>
    link.entityId === where.entityId
    && (where.id == null || link.id === where.id)
    && oneOf(where.from, link.from)
    && oneOf(where.to, link.to)
    && oneOf(where.type, link.type)
    && (where.fromKind == null || (link.fromKind ?? 'workcard') === where.fromKind)
    && (where.toKind == null || (link.toKind ?? 'workcard') === where.toKind)
    && (where.project == null || (link.project != null && oneOf(where.project, link.project)))

  // ─── Data-defined schemas (only with `schemas: true`) ──────────────────────────────────────────

  const schemaRecords = new Map<string, ScopedSchemaRecord>()
  const revisions = new Map<string, number>()
  const watchers = new Set<(entityId: string) => void>()

  const bumpRevision = (entityId: string): number => {
    const revision = (revisions.get(entityId) ?? 0) + 1
    revisions.set(entityId, revision)
    for (const watcher of [...watchers]) {
      try {
        watcher(entityId)
      } catch (error) {
        storeLog.error('Planning schema watcher failed', error)
      }
    }
    return revision
  }

  const matchesSchema = (record: ScopedSchemaRecord, where: ScopedSchemaWhere): boolean =>
    record.entityId === where.entityId
    && (where.project === undefined || (where.project === null ? record.project == null : record.project === where.project))
    && (where.kind == null || record.kind === where.kind)
    && oneOf(where.key, record.key)
    && (where.retired == null || (record.retired === true) === where.retired)

  const purgeSchemas = (entityId: string, projects: Iterable<string>): number => {
    const doomed = new Set(projects)
    let count = 0
    for (const [key, record] of [...schemaRecords.entries()]) {
      if (record.entityId === entityId && record.project != null && doomed.has(record.project)) {
        schemaRecords.delete(key)
        count++
      }
    }
    if (count > 0) {
      bumpRevision(entityId)
    }
    return count
  }

  const schemaStore: SchemaStore = {
    list: async where => [...schemaRecords.values()].filter(record => matchesSchema(record, where))
      .sort((left, right) => left.kind.localeCompare(right.kind) || left.key.localeCompare(right.key))
      .map(copy),

    put: async record => {
      const key = scopedSchemaHelper.schemaRecordKey(record)
      const stored = schemaRecords.get(key)
      if ((stored?.version ?? 0) !== record.version - 1) {
        throw new SchemaConflict(`${record.kind}:${record.key}:expected:${record.version - 1}:stored:${stored?.version ?? 0}`)
      }
      const written: ScopedSchemaRecord = {
        ...copy(record), id: stored?.id ?? record.id ?? ids(), rev: (revisions.get(record.entityId) ?? 0) + 1,
      }
      schemaRecords.set(key, written)
      bumpRevision(record.entityId)

      return copy(written)
    },

    purge: async where => purgeSchemas(where.entityId, [where.project]),

    revision: async entityId => revisions.get(entityId) ?? 0,

    watch: listener => {
      watchers.add(listener)
      const unsubscribe: Unsubscribe = () => { watchers.delete(listener) }
      return unsubscribe
    },
  }

  const statusOf = async (id: string): Promise<CommitStatus | null> => {
    const transition = log.get(id)
    if (transition == null) {
      return null
    }
    const status: CommitStatus = { transition: id, state: transition.commit.state }
    if (transition.commit.at != null) {
      status.at = transition.commit.at
    }
    if (transition.commit.error != null) {
      status.error = transition.commit.error
    }
    if (transition.commit.state === CommitState.Committed) {
      const record = transition.action === TransitionAction.Delete ? undefined : recordOf(transition.card)
      status.card = record != null && record.entityId === transition.entityId ? withHead(record) : null
    }
    return status
  }

  const hub = makeCommitHub({ status: statusOf })

  const transitions: TransitionStore = {
    append: async transition => {
      const id = transition.id ?? ids()
      const stored: Transition = { ...copy(transition), id }
      if (log.has(id)) {
        throw new PlanningError(`duplicate-transition:${id}`)
      }
      const taken = logOf(stored.card).some(entry => entry.seq === stored.seq)
      const duplicateKey = stored.key != null && keys.has(keyOf(stored.entityId, stored.key))
      if (taken || duplicateKey) {
        // Release the allocation this append was for, or the card's log keeps a gap forever.
        if (heads.get(stored.card) === stored.seq && !taken) {
          heads.set(stored.card, stored.seq - 1)
        }
        throw taken
          ? new WorkcardConflict(`${stored.card}:seq:${stored.seq}`)
          : new PlanningError(`duplicate-key:${stored.key}`)
      }
      remember(stored)

      return copy(stored)
    },

    get: async id => {
      const transition = log.get(id)
      return transition == null ? null : copy(transition)
    },

    byKey: async (entityId, key) => {
      const id = keys.get(keyOf(entityId, key))
      const transition = id == null ? undefined : log.get(id)
      return transition == null ? null : copy(transition)
    },

    list: async (where, listOpts) => {
      const pool = where.card != null && !Array.isArray(where.card) ? logOf(where.card) : [...log.values()]
      const result = recordQueryHelper.applyQuery(pool.filter(transition => matchesTransition(transition, where)), undefined, { ...listOpts, sort: listOpts?.sort ?? ['at', 'seq'] })
      return { ...result, items: result.items.map(copy) }
    },

    nextSeq: async (card, expect) => {
      const head = heads.get(card) ?? 0
      if (expect != null && expect !== head) {
        throw new WorkcardConflict(`${card}:expected:${expect}:head:${head}`)
      }
      heads.set(card, head + 1)

      return head + 1
    },

    head: async card => heads.get(card) ?? 0,

    commit: async (id, commit) => {
      const transition = log.get(id)
      if (transition != null) {
        log.set(id, { ...transition, commit: copy(commit) })
      }
    },

    purge: async where => {
      const doomed = [...log.values()].filter(transition => matchesTransition(transition, where))
      doomed.forEach(transition => forget(transition.id!))

      return doomed.length
    },
  }

  const fold = (cardId: string): Promise<unknown> => {
    const previous = folding.get(cardId) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(async () => {
      const entityId = logOf(cardId)[0]?.entityId
      if (entityId == null) {
        return null
      }
      const events: import('@owlmeans/planning').CommitEvent[] = []
      const run = async () => await foldHelper.foldPending(store, cardId, entityId, {
        now,
        publish: async event => { await hub.publish(event); if (event.state === CommitState.Committed) events.push(event) },
      })
      const result = await store.unit!(entityId, run)
      // Hooks run after the organization unit releases; they may append new planning work.
      for (const event of events) await committed?.(event)
      return result
    })
    folding.set(cardId, next)
    const release = (): void => {
      if (folding.get(cardId) === next) {
        folding.delete(cardId)
      }
    }
    void next.then(release, release)

    return next
  }

  const cardStore: ProjectionStore = {
    get: async (id, entityId) => {
      const record = recordOf(id)
      return record == null || record.entityId !== entityId ? null : withHead(record)
    },

    list: async (where, listOpts) => {
      const pool = wantsSpecifications(where) ? [...cards.values(), ...specs.values()] : [...cards.values()]
      const result = recordQueryHelper.applyQuery(pool, where, listOpts)
      return { ...result, items: result.items.map(withHead) }
    },

    count: async where => recordQueryHelper.filterRecords(wantsSpecifications(where) ? [...cards.values(), ...specs.values()] : [...cards.values()], where).length,

    summary: async (parents, where) => queryHelper.summaryOf(recordQueryHelper.filterRecords([...cards.values()], where), parents),

    put: async card => {
      if (card.id == null) {
        throw new PlanningError('malformed:put-without-id')
      }
      const record = copy(card)
      if (record.kind === WorkcardKind.Specification) {
        specs.set(record.id!, record as Specification)
        cards.delete(record.id!)
      } else {
        cards.set(record.id!, record)
        specs.delete(record.id!)
      }
    },

    drop: async (id, entityId) => {
      if (recordOf(id)?.entityId !== entityId) {
        return
      }
      // The record's own documents go with it, the way everything under a project goes with the
      // project: their edges and log too. The record's own log stays — its delete is the tombstone.
      const documents = documentsOf(id, entityId)
      for (const link of [...links.values()]) {
        if (link.entityId === entityId && (((link.fromKind ?? PlanningResourceKind.Workcard) === PlanningResourceKind.Workcard && documents.has(link.from))
          || ((link.toKind ?? PlanningResourceKind.Workcard) === PlanningResourceKind.Workcard && documents.has(link.to)))) {
          links.delete(link.id!)
        }
      }
      for (const transition of [...log.values()]) {
        if (transition.entityId === entityId && documents.has(transition.card)) {
          forget(transition.id!)
        }
      }
      const doomed = new Set([id, ...documents])
      for (const target of doomed) {
        cards.delete(target)
        specs.delete(target)
      }
      for (const row of [...comments.values()]) if (row.entityId === entityId && doomed.has(row.card)) {
        for (const mention of [...mentions.values()]) if (mention.entityId === entityId && mention.comment === row.id) mentions.delete(mention.id!)
        comments.delete(row.id!)
      }
    },

    project: async card => {
      if (sync) {
        await fold(card)
      }
    },

    purge: async (project, entityId) => {
      if (project == null || project === '') {
        throw new PlanningError('purge:empty')
      }
      const doomed = new Set<string>([project])
      const records = () => [...cards.values(), ...specs.values()].filter(record => record.entityId === entityId)
      let grown = true
      while (grown) {
        grown = false
        for (const record of records()) {
          if (doomed.has(record.id!)) {
            continue
          }
          if ((record.parent != null && doomed.has(record.parent)) || record.parents.some(parent => doomed.has(parent))) {
            doomed.add(record.id!)
            grown = true
          }
        }
      }

      let count = 0
      for (const link of [...links.values()]) {
        if (link.entityId === entityId && (((link.fromKind ?? PlanningResourceKind.Workcard) === PlanningResourceKind.Workcard && doomed.has(link.from))
          || ((link.toKind ?? PlanningResourceKind.Workcard) === PlanningResourceKind.Workcard && doomed.has(link.to))
          || (link.project != null && doomed.has(link.project) && recordOf(link.from) == null))) {
          links.delete(link.id!)
          count++
        }
      }
      for (const transition of [...log.values()]) {
        if (transition.entityId === entityId && (doomed.has(transition.card)
          || (transition.project != null && doomed.has(transition.project) && recordOf(transition.card) == null))) {
          forget(transition.id!)
          count++
        }
      }
      for (const id of doomed) {
        const record = recordOf(id)
        if (record != null && record.entityId === entityId) {
          cards.delete(id)
          specs.delete(id)
          count++
        }
      }
      for (const row of [...comments.values()]) if (row.entityId === entityId && doomed.has(row.card)) {
        for (const mention of [...mentions.values()]) if (mention.entityId === entityId && mention.comment === row.id) { mentions.delete(mention.id!); count++ }
        comments.delete(row.id!); count++
      }
      // A purged project's own schema layer goes with it.
      count += purgeSchemas(entityId, doomed)

      return count
    },
  }

  const specStore: SpecificationStore = {
    current: async (parent, category, entityId) => {
      const current = specificationHelper.currentSpecification(
        [...specs.values()].filter(spec => spec.entityId === entityId && spec.parent === parent), category
      )
      return current == null ? null : withHead(current)
    },

    list: async (parent, entityId, query) => {
      let pool = recordQueryHelper.filterRecords([...specs.values()], queryHelper.specCriteriaOf(parent, query, { entityId }))
      if (query?.all !== true) {
        const categories = [...new Set(pool.map(spec => spec.category))]
        pool = categories.map(category => specificationHelper.currentSpecification(pool, category))
          .filter((spec): spec is Specification => spec != null)
      }
      const result = recordQueryHelper.applyQuery(pool, undefined, queryHelper.listOptionsOf(query))
      return { ...result, items: result.items.map(withHead) }
    },

    revisions: async (id, entityId, limit) => {
      const spec = specs.get(id)
      return spec == null || spec.entityId !== entityId ? [] : foldHelper.revisionsFromLog(logOf(id), limit)
    },
  }

  const linkStore: RelationshipStore = {
    list: async (where, listOpts) => {
      const result = recordQueryHelper.applyQuery([...links.values()].filter(link => matchesLink(link, where)), undefined, listOpts)
      return { ...result, items: result.items.map(copy) }
    },

    put: async link => {
      const existing = [...links.values()].find(entry => entry.entityId === link.entityId
        && entry.from === link.from && entry.to === link.to && entry.type === link.type
        && (entry.fromKind ?? 'workcard') === (link.fromKind ?? 'workcard') && (entry.toKind ?? 'workcard') === (link.toKind ?? 'workcard'))
      if (existing != null) {
        return copy(existing)
      }
      const stored = { ...copy(link), id: link.id ?? ids() }
      links.set(stored.id, stored)

      return copy(stored)
    },

    drop: async where => {
      if (where.id == null && where.from == null && where.to == null && where.type == null) {
        throw new PlanningError('links:drop-empty')
      }
      const doomed = [...links.values()].filter(link => matchesLink(link, where))
      doomed.forEach(link => links.delete(link.id!))

      return doomed.length
    },
  }

  const store: MemoryPlanningStore = {
    alias: opts.alias ?? MEMORY_STORE_ALIAS,
    capabilities: { transitions: true, sync, purge: true, revisions: true },
    newId: ids,
    transitions,
    assignees: resourcePort(assignees),
    teams: resourcePort(teams),
    comments: resourcePort(comments),
    mentions: resourcePort(mentions),
    unit: async (entityId, run) => {
      const previous = units.get(entityId) ?? Promise.resolve()
      const next = previous.catch(() => undefined).then(run)
      units.set(entityId, next)
      try { return await next } finally { if (units.get(entityId) === next) units.delete(entityId) }
    },
    cards: cardStore,
    specs: specStore,
    links: linkStore,
    commits: hub,
    ...(opts.schemas === true ? { schemas: schemaStore } : {}),

    bind: listener => { committed = listener },

    flush: async card => {
      if (card != null) {
        await fold(card)
        return
      }
      const pending = [...new Set([...log.values()]
        .filter(transition => transition.commit.state === CommitState.Pending)
        .map(transition => transition.card))]
      for (const id of pending) {
        await fold(id)
      }
    },
  }

  opts.seed?.cards?.forEach(card => {
    const record = copy(card)
    if (record.kind === WorkcardKind.Specification) {
      specs.set(record.id!, record as Specification)
    } else {
      cards.set(record.id!, record)
    }
  })
  opts.seed?.links?.forEach(link => {
    const id = link.id ?? ids()
    links.set(id, { ...copy(link), id })
  })
  opts.seed?.transitions?.forEach(transition => remember({ ...copy(transition), id: transition.id ?? ids() }))
  if (opts.schemas === true) {
    opts.seed?.schemas?.forEach(record => {
      schemaRecords.set(scopedSchemaHelper.schemaRecordKey(record), { ...copy(record), id: record.id ?? ids() })
      revisions.set(record.entityId, Math.max(revisions.get(record.entityId) ?? 0, record.rev ?? 1))
    })
  }

  return store
}
