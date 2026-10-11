import { cardHelper, CommitState, PlanningUnsupported, TransitionAction, type CommitEvent, type PlanningStore, type Transition, type Workcard } from '@owlmeans/planning'
import { logger } from '@owlmeans/log'
import { foldHelper, type FoldResult } from '@owlmeans/server-planning/store'
import { DEFAULT_RECOVER_LIMIT, LOST_ALLOCATION, MAX_FOLD_PASSES, MAX_FOLD_ROUNDS, PLANNING_POSTGRES_STORE, LOCK_NOT_AVAILABLE } from '../consts.js'
import { sqlHelper } from '../sql.js'
import { cardSqlOf } from './card-sql.js'
import { linkSqlOf } from './link-sql.js'
import { schemaSqlOf } from './schema-sql.js'
import { transitionSqlOf } from './transition-sql.js'
import { EMPTY } from './consts.local.js'
import type { FoldPlan, LockMode } from './types.local.js'
import type { FoldContext, FoldEngine, FoldEngineDeps } from './types.js'
import { pgNameHelper } from '@owlmeans/postgres-resource'

// Not `log`: the transition table is called that throughout this module.
const foldLog = logger('planning-postgres:fold')

const safely = async (label: string, run: () => Promise<unknown> | unknown): Promise<void> => {
  try {
    await run()
  } catch (error) {
    foldLog.error('Planning store step failed', { step: label, error })
  }
}

/** A transaction a statement failed in — rolled back, never committed. */
class Poisoned extends Error { }

const poisoned = (lock: string, cause: unknown): Poisoned => {
  const failure = new Poisoned(`planning-postgres: fold of ${lock} aborted by a failed statement`)
  ;(failure as { cause?: unknown }).cause = cause
  return failure
}

const lockTimedOut = (error: unknown): boolean => sqlHelper.pgFault(error).code === LOCK_NOT_AVAILABLE

const strip = (event: CommitEvent): Omit<CommitEvent, 'record'> => {
  const { record: _record, ...bare } = event
  return bare
}

/**
 * The inline fold of a Postgres planning store.
 *
 * Every fold of a card is ONE transaction under `pg_advisory_xact_lock(planning:<card table>:<card>)`,
 * with `SET LOCAL lock_timeout`. Inside it: the prelude, then `foldPending` over a view of the ports
 * bound to that transaction (each transition's writes in a savepoint), then a NOTIFY per settled
 * event. Events are delivered to the commit hub and the `after` hooks only once it COMMITS — never
 * inside the transaction or the lock, so a hook may write to the card it saw commit.
 *
 * A transaction a statement failed in is poisoned and never committed. The fold is retried once;
 * failing again, the card's pending transitions are failed in a fresh transaction (`failPending`)
 * so no waiter is left to its timeout. A lock that could not be taken means another process is
 * folding the card: nothing is failed, and a heal follows.
 */
export const makeFoldEngine = (deps: FoldEngineDeps): FoldEngine => {
  const { limits } = deps
  const { clientRunner, col, insertOf } = sqlHelper
  const chains = new Map<string, Promise<unknown>>()
  const healing = new Set<string>()

  /** One transaction of this process per card at a time — the advisory lock serializes processes. */
  const serial = <R>(card: string, run: () => Promise<R>): Promise<R> => {
    const previous = chains.get(card) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(run)
    chains.set(card, next)
    const release = (): void => {
      if (chains.get(card) === next) {
        chains.delete(card)
      }
    }
    void next.then(release, release)
    return next
  }

  const transaction = async <R>(
    lock: string, mode: LockMode, run: (ctx: FoldContext) => Promise<R>
  ): Promise<{ skipped: true } | { skipped: false, result: R, ctx: FoldContext }> => {
    const tables = await deps.tables()
    const client = await (await deps.pool()).connect()
    let poison: unknown
    let savepoints = 0
    const runner = clientRunner(client, error => { poison ??= error })
    const ctx: FoldContext = {
      runner,
      tables,
      events: [],
      schemas: new Set(),
      savepoint: async <T>(unit: () => Promise<T>): Promise<T> => {
        const name = `planning_unit_${++savepoints}`
        const before = poison
        await runner.query(`SAVEPOINT ${name}`)
        try {
          const value = await unit()
          await runner.query(`RELEASE SAVEPOINT ${name}`)
          return value
        } catch (error) {
          try {
            await client.query(`ROLLBACK TO SAVEPOINT ${name}`)
            await client.query(`RELEASE SAVEPOINT ${name}`)
            // Rolled back to before the unit: whatever it broke is undone, the transaction is usable.
            poison = before
          } catch {
            // The rollback itself failed — the transaction stays poisoned.
          }
          throw error
        }
      },
    }

    try {
      await client.query('BEGIN')
      await client.query(`SET LOCAL lock_timeout = '${Math.max(0, Math.floor(limits.lockTimeoutMs))}ms'`)
      const [first, second] = pgNameHelper.advisoryKey(`planning:${tables.card.qualified}:${lock}`)
      if (mode === 'try') {
        const taken = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_xact_lock($1, $2) AS ok', [first, second])
        if (taken.rows[0]?.ok !== true) {
          await client.query('ROLLBACK')
          return { skipped: true }
        }
      } else {
        await client.query('SELECT pg_advisory_xact_lock($1, $2)', [first, second])
      }
      const entityId = (await cardSqlOf(ctx).readCardRow(lock))?.entityId ?? await logEntityOf(ctx, lock)
      if (entityId != null) {
        const [entityFirst, entitySecond] = pgNameHelper.advisoryKey(`planning:entity:${tables.card.qualified}:${entityId}`)
        await client.query('SELECT pg_advisory_xact_lock($1, $2)', [entityFirst, entitySecond])
      }
      const result = await deps.inTransaction(runner, async () => await run(ctx))
      if (poison != null) {
        throw poisoned(lock, poison)
      }
      await client.query('COMMIT')
      return { skipped: false, result, ctx }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      // The statement that broke the transaction is the cause — not the "transaction is aborted"
      // every statement after it answers.
      throw poison != null && !(error instanceof Poisoned) ? poisoned(lock, poison) : error
    } finally {
      client.release()
    }
  }

  // ─── The transaction-bound view foldPending and failPending run over ──────────────────────────

  const refuse = (what: string) => async (): Promise<never> => { throw new PlanningUnsupported(`fold-view:${what}`) }

  const viewOf = (ctx: FoldContext): PlanningStore => {
    const transitions = transitionSqlOf(ctx)
    const cards = cardSqlOf(ctx)
    const links = linkSqlOf(ctx)

    return {
      alias: PLANNING_POSTGRES_STORE,
      validateProjection: deps.validateProjection,
      projectReferences: deps.projectReferences,
      transitions: {
        append: refuse('append'),
        get: async id => await transitions.readTransition(id),
        byKey: async (entityId, key) => await transitions.readTransitionByKey(entityId, key),
        list: async (where, opts) => await transitions.listTransitions(where, opts?.size ?? 0),
        nextSeq: refuse('nextSeq'),
        head: refuse('head'),
        commit: async (id, commit) => { await transitions.commitTransition(id, commit) },
        purge: refuse('purge'),
      },
      cards: {
        get: async (id, entityId) => await cards.readCard(id, entityId),
        list: refuse('list'),
        count: refuse('count'),
        summary: refuse('summary'),
        put: async card => { await cards.writeCard(card) },
        drop: async (id, entityId) => {
          await ctx.runner.query(`DELETE FROM ${ctx.tables.mention.qualified} WHERE ${col(ctx.tables.mention, 'entityId')}=$1 AND ${col(ctx.tables.mention, 'card')}=$2`, [entityId, id])
          await ctx.runner.query(`DELETE FROM ${ctx.tables.comment.qualified} WHERE ${col(ctx.tables.comment, 'entityId')}=$1 AND ${col(ctx.tables.comment, 'card')}=$2`, [entityId, id])
          await cards.dropCard(id, entityId)
        },
        project: refuse('project'),
        purge: async (project, entityId) => await purgeInside(ctx, project, entityId),
      },
      links: {
        list: async where => await links.listLinks(where),
        put: async link => await links.putLink(link, deps.ids),
        drop: async where => await links.dropLinks(where),
      },
    }
  }

  // ─── Purge ─────────────────────────────────────────────────────────────────────────────────────

  /**
   * Everything under a project, in the open transaction: the recursive walk over `parents` finds
   * every doomed card (nested projects too); then links, transitions, the doomed projects' schema
   * layers and the cards themselves go — in that order. The project's own `delete` transitions stay
   * as its tombstone, so a waiter still reads the delete committed.
   */
  const purgeInside = async (ctx: FoldContext, project: string, entityId: string): Promise<number> => {
    const schemaSql = schemaSqlOf(ctx)
    const { card: cards, transition: log, link: links } = ctx.tables
    const parents = cards.byProperty.parents
    const doomed = (await ctx.runner.query<{ id: string }>(
      `WITH RECURSIVE doomed(id) AS (`
      + ` SELECT $1::text`
      + ` UNION SELECT child.${col(cards, 'id')}::text FROM ${cards.qualified} AS child JOIN doomed`
      + ` ON child.${col(cards, 'parents')} @> ARRAY[doomed.id]::${parents.sqlType}`
      + ` WHERE child.${col(cards, 'entityId')} = $2`
      + `) SELECT id FROM doomed`,
      [project, entityId]
    )).map(row => row.id)

    let count = 0
    for (const table of [ctx.tables.mention, ctx.tables.comment]) count += (await ctx.runner.query(`DELETE FROM ${table.qualified} WHERE ${col(table, 'entityId')}=$1 AND ${col(table, 'card')}=ANY($2) RETURNING ${col(table, 'id')}`, [entityId, doomed])).length
    count += (await ctx.runner.query(
      `DELETE FROM ${links.qualified} AS edge WHERE ${col(links, 'entityId')} = $1 AND (`
      + ` (COALESCE(${col(links, 'fromKind')}, 'workcard')='workcard' AND ${col(links, 'from')}=ANY($2))`
      + ` OR (COALESCE(${col(links, 'toKind')}, 'workcard')='workcard' AND ${col(links, 'to')}=ANY($2))`
      + ` OR (${col(links, 'project')}=ANY($2) AND NOT EXISTS (`
      + `SELECT 1 FROM ${cards.qualified} AS survivor WHERE survivor.${col(cards, 'entityId')}=$1 AND survivor.${col(cards, 'id')}=edge.${col(links, 'from')} AND survivor.${col(cards, 'seq')}>0))) RETURNING ${col(links, 'id')}`,
      [entityId, doomed]
    )).length
    count += (await ctx.runner.query(
      `DELETE FROM ${log.qualified} AS history WHERE ${col(log, 'entityId')} = $1 AND (${col(log, 'card')} = ANY($2)`
      + ` OR (${col(log, 'project')}=ANY($2) AND NOT EXISTS (`
      + `SELECT 1 FROM ${cards.qualified} AS survivor WHERE survivor.${col(cards, 'entityId')}=$1 AND survivor.${col(cards, 'id')}=history.${col(log, 'card')} AND survivor.${col(cards, 'seq')}>0)))`
      + ` AND NOT (${col(log, 'card')} = $3 AND ${col(log, 'action')} = $4) RETURNING ${col(log, 'id')}`,
      [entityId, doomed, project, TransitionAction.Delete]
    )).length
    const layers = await schemaSql.purgeSchemaLayers(entityId, doomed)
    if (layers > 0) {
      await schemaSql.bumpRevision(entityId, deps.now(), deps.ids)
      await deps.bus.notify(ctx.runner, { t: 's', e: entityId })
      ctx.schemas.add(entityId)
      count += layers
    }
    count += (await ctx.runner.query(
      `DELETE FROM ${cards.qualified} WHERE ${col(cards, 'entityId')} = $1 AND ${col(cards, 'id')} = ANY($2) RETURNING ${col(cards, 'id')}`,
      [entityId, doomed]
    )).length

    return count
  }

  // ─── The prelude ───────────────────────────────────────────────────────────────────────────────

  /** The organization of a card that has a log but no row (its create has not folded). */
  const logEntityOf = async (ctx: FoldContext, cardId: string): Promise<string | null> => {
    const log = ctx.tables.transition
    const rows = await ctx.runner.query<{ entityId: string }>(
      `SELECT ${col(log, 'entityId')} AS "entityId" FROM ${log.qualified} WHERE ${col(log, 'card')} = $1 ORDER BY ${col(log, 'seq')} LIMIT 1`,
      [cardId]
    )
    return rows[0]?.entityId ?? null
  }

  /** Failed rows over allocations that never got one — what lets the fold step over a hole. */
  const placeholders = async (
    ctx: FoldContext, card: Workcard, from: number, to: number, project?: string
  ): Promise<boolean> => {
    const at = deps.now()
    for (let seq = from; seq <= to; seq++) {
      const row: Transition = {
        id: deps.ids(), entityId: card.entityId, card: card.id!, kind: card.kind, type: card.type,
        ...(project != null ? { project } : {}),
        seq, action: TransitionAction.Update, changes: {}, actor: { service: PLANNING_POSTGRES_STORE },
        cause: LOST_ALLOCATION, at, commit: { state: CommitState.Failed, at, error: LOST_ALLOCATION },
      }
      const log = ctx.tables.transition
      const statement = insertOf(log, row as unknown as Record<string, unknown>, {
        tail: `ON CONFLICT (${col(log, 'card')}, ${col(log, 'seq')}) DO NOTHING RETURNING ${col(log, 'id')}`,
      })
      if ((await ctx.runner.query(statement.text, statement.params)).length === 0) {
        // The real row landed after all: the fold reads it on its next round.
        return false
      }
    }
    return true
  }

  /**
   * Walk the log past `card.seq`: a FAILED row at the cursor moves the cursor past it; PENDING rows
   * from the cursor on are the run `foldPending` folds; a GAP (a row past the expected seq, or an
   * allocated head with no row at all) is an append still in flight while it is younger than
   * `gapGraceMs` — the fold stops there, and the appender's own `project()` folds it — and a lost
   * allocation after that: one failed `lost-allocation` placeholder per missing seq, and on.
   * `nextSeq` and `append` are two round trips here, so without this a transient gap or an
   * already-failed row would make the next write fail as out of order.
   *
   * A card with no row folds its log as it is: a create from seq 1, and anything else fails out of
   * order. `null` when there is neither a row nor a log.
   */
  const prelude = async (ctx: FoldContext, cardId: string): Promise<FoldPlan | null> => {
    const transitionSql = transitionSqlOf(ctx)
    const card = await cardSqlOf(ctx).readCardRow(cardId)
    if (card == null) {
      const entityId = await logEntityOf(ctx, cardId)
      if (entityId == null) {
        return null
      }
      const pending = await transitionSql.listTransitions({ entityId, card: cardId, state: CommitState.Pending }, limits.foldBatch)
      return { entityId, run: pending.items.length, more: false, full: pending.total > pending.items.length }
    }
    const entityId = card.entityId
    const rows = (await transitionSql.listTransitions({ entityId, card: cardId, sinceSeq: card.seq }, limits.foldBatch)).items

    const now = Date.now()
    let expected = card.seq + 1
    let advanced = card.seq
    let run = 0
    let more = false
    let consumed = true
    for (const row of rows) {
      if (row.seq < expected) {
        continue
      }
      if (row.seq > expected) {
        if (run > 0) {
          // The run ends at the hole; the next pass meets it at the cursor.
          more = true
          consumed = false
          break
        }
        if (now - Date.parse(row.at) < limits.gapGraceMs || !await placeholders(ctx, card, expected, row.seq - 1, row.project)) {
          consumed = false
          break
        }
        advanced = row.seq - 1
        expected = row.seq
      }
      if (row.commit.state === CommitState.Failed) {
        if (run > 0) {
          more = true
          consumed = false
          break
        }
        advanced = row.seq
        expected = row.seq + 1
        continue
      }
      if (row.commit.state === CommitState.Pending) {
        run++
        expected++
        continue
      }
      // Committed yet past the card's seq: nothing a fold may touch.
      consumed = false
      break
    }
    const full = rows.length >= limits.foldBatch
    if (consumed && run === 0 && !full) {
      const head = card.head ?? card.seq
      if (head > advanced && card.headAt != null && now - Date.parse(card.headAt) >= limits.gapGraceMs
        && await placeholders(ctx, card, advanced + 1, head, rows.at(-1)?.project ?? (cardHelper.isProject(card) ? card.id : undefined))) {
        advanced = head
      }
    }
    if (advanced > card.seq) {
      const spec = ctx.tables.card
      await ctx.runner.query(
        `UPDATE ${spec.qualified} SET ${col(spec, 'seq')} = $2, ${col(spec, 'head')} = GREATEST(COALESCE(${col(spec, 'head')}, ${col(spec, 'seq')}), $2)`
        + ` WHERE ${col(spec, 'id')} = $1`,
        [cardId, advanced]
      )
    }

    return { entityId, run, more, full: full && consumed }
  }

  // ─── Folding ───────────────────────────────────────────────────────────────────────────────────

  const notifyAll = async (ctx: FoldContext): Promise<void> => {
    for (const event of ctx.events) {
      await deps.bus.notify(ctx.runner, { t: 'c', e: strip(event) })
    }
  }

  /**
   * Passes of prelude + `foldPending`, each folding exactly the run the prelude measured, until the
   * log is folded, a young gap stops it, or a pass makes no progress.
   */
  const foldInside = async (ctx: FoldContext, cardId: string): Promise<FoldResult> => {
    const total: FoldResult = { card: null, folded: 0, failed: 0, followUp: false }
    for (let pass = 0; pass < MAX_FOLD_PASSES; pass++) {
      const plan = await prelude(ctx, cardId)
      if (plan == null) {
        break
      }
      total.followUp = plan.full
      if (plan.run === 0) {
        total.card = await cardSqlOf(ctx).readCard(cardId, plan.entityId)
        break
      }
      const result = await foldHelper.foldPending(viewOf(ctx), cardId, plan.entityId, {
        now: deps.now,
        limit: plan.run,
        unit: ctx.savepoint,
        publish: async event => { ctx.events.push(event) },
      })
      total.card = result.card
      total.folded += result.folded
      total.failed += result.failed
      if (!plan.more || result.folded + result.failed === 0) {
        break
      }
    }
    await notifyAll(ctx)
    return total
  }

  const failInside = async (ctx: FoldContext, cardId: string, reason: string): Promise<FoldResult> => {
    const entityId = (await cardSqlOf(ctx).readCardRow(cardId))?.entityId ?? await logEntityOf(ctx, cardId)
    if (entityId == null) {
      return EMPTY
    }
    const failed = await foldHelper.failPending(viewOf(ctx), cardId, entityId, reason, {
      now: deps.now, publish: async event => { ctx.events.push(event) },
    })
    await notifyAll(ctx)
    return { card: null, folded: 0, failed, followUp: false }
  }

  /** After the commit, in order: the hub (this process's subscribers and waiters), then the hooks. */
  const deliver = async (ctx: FoldContext): Promise<void> => {
    for (const entityId of ctx.schemas) {
      deps.schemasTouched(entityId)
    }
    for (const event of ctx.events) {
      await safely('commit publish', () => deps.hub.publish(event))
      if (event.state === CommitState.Committed) {
        const committed = deps.committed()
        if (committed != null) {
          await safely('committed hooks', () => committed(event))
        }
      }
    }
  }

  const reasonOf = (error: unknown): string => {
    const cause = (error as { cause?: unknown } | null)?.cause ?? error
    return cause instanceof Error ? cause.message : `${cause}`
  }

  /** One round: fold, retry once, then fail what is pending — or yield to a folder holding the lock. */
  const round = async (cardId: string, mode: LockMode): Promise<FoldResult> => {
    const attempt = () => serial(cardId, () => transaction(cardId, mode, ctx => foldInside(ctx, cardId)))
    let outcome: Awaited<ReturnType<typeof attempt>>
    try {
      outcome = await attempt()
    } catch (first) {
      if (lockTimedOut(first)) {
        engine.heal(cardId)
        return EMPTY
      }
      try {
        outcome = await attempt()
      } catch (second) {
        if (lockTimedOut(second)) {
          engine.heal(cardId)
          return EMPTY
        }
        foldLog.error('Planning fold failed twice, failing its pending transitions', { cardId, error: second })
        try {
          outcome = await serial(cardId, () => transaction(cardId, 'wait', ctx => failInside(ctx, cardId, reasonOf(second))))
        } catch (third) {
          foldLog.error('Planning cannot fail the pending transitions', { cardId, error: third })
          return EMPTY
        }
      }
    }
    if (outcome.skipped) {
      return EMPTY
    }
    await deliver(outcome.ctx)
    return outcome.result
  }

  const foldWith = async (cardId: string, mode: LockMode): Promise<FoldResult> => {
    let result: FoldResult = EMPTY
    for (let rounds = 0; rounds < MAX_FOLD_ROUNDS && !deps.closed(); rounds++) {
      result = await round(cardId, mode)
      if (!result.followUp) {
        break
      }
    }
    return result
  }

  const engine: FoldEngine = {
    fold: cardId => foldWith(cardId, 'wait'),

    heal: cardId => {
      if (healing.has(cardId) || deps.closed()) {
        return
      }
      healing.add(cardId)
      void foldWith(cardId, 'try')
        .catch(error => foldLog.error('Planning heal failed', { cardId, error }))
        .finally(() => { healing.delete(cardId) })
    },

    recover: async opts => {
      const tables = await deps.tables()
      const log = tables.transition
      const cutoff = new Date(Date.now() - (opts?.olderThanMs ?? limits.recoverAfterMs)).toISOString()
      const pool = await deps.pool()
      const stale = (await pool.query<{ card: string }>(
        `SELECT ${col(log, 'card')} AS card, MIN(${col(log, 'at')}) AS first FROM ${log.qualified}`
        + ` WHERE (${col(log, 'commit')}->>'state') = 'pending' AND ${col(log, 'at')} < $1`
        + ` GROUP BY ${col(log, 'card')} ORDER BY first LIMIT $2`,
        [cutoff, opts?.limit ?? DEFAULT_RECOVER_LIMIT]
      )).rows
      let folded = 0
      for (const { card } of stale) {
        if (deps.closed()) {
          break
        }
        await foldWith(card, 'try')
        folded++
      }
      return folded
    },

    purge: async (project, entityId) => {
      const outcome = await serial(project, () => transaction(project, 'wait', ctx => purgeInside(ctx, project, entityId)))
      if (outcome.skipped) {
        return 0
      }
      await deliver(outcome.ctx)
      return outcome.result
    },
  }

  return engine
}
