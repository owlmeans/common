import { CommitState, PlanningError, WorkcardConflict } from '@owlmeans/planning'
import type { Transition, TransitionCommit, TransitionStore, TransitionWhere } from '@owlmeans/planning'
import type { Criteria, ListResult, Sort } from '@owlmeans/resource'
import { cleanRecord, col, insertOf, pgFault, recordOf, UNIQUE_VIOLATION, whereOf } from '../sql.js'
import type { SqlContext } from '../sql.js'
import type { PlanningTransitionResource } from '../types.js'

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

/** The portable criteria of a transition query — what a resource list reads the log with. */
export const transitionCriteria = (where: TransitionWhere): Criteria<Transition> => clean({
  entityId: where.entityId,
  card: where.card,
  project: where.project,
  seq: where.sinceSeq != null ? { $gt: where.sinceSeq } : undefined,
  'commit.state': where.state,
  action: where.action,
}) as Criteria<Transition>

export const transitionOf = (row: Record<string, unknown>, sql: SqlContext): Transition =>
  recordOf<Transition>(row, sql.tables.transition)

export const readTransition = async (sql: SqlContext, id: string): Promise<Transition | null> => {
  const spec = sql.tables.transition
  const rows = await sql.runner.query(`SELECT * FROM ${spec.qualified} WHERE ${col(spec, 'id')} = $1`, [id])
  return rows[0] == null ? null : transitionOf(rows[0], sql)
}

export const readTransitionByKey = async (sql: SqlContext, entityId: string, key: string): Promise<Transition | null> => {
  const spec = sql.tables.transition
  const rows = await sql.runner.query(
    `SELECT * FROM ${spec.qualified} WHERE ${col(spec, 'entityId')} = $1 AND ${col(spec, 'key')} = $2`, [entityId, key]
  )
  return rows[0] == null ? null : transitionOf(rows[0], sql)
}

/**
 * The log of one card (or several) in `seq` order, as a fold reads it: this package's own statement,
 * so it runs inside a fold's transaction. `size` bounds it (0 is no limit); `total` tells a bounded
 * read that more remain.
 */
export const listTransitions = async (
  sql: SqlContext, where: TransitionWhere, size: number = 0
): Promise<ListResult<Transition>> => {
  const spec = sql.tables.transition
  const fixed = whereOf(spec, {
    entityId: where.entityId,
    card: where.card,
    project: where.project,
    action: where.action as string | string[] | undefined,
  })
  const params = [...fixed.params]
  const clauses = [fixed.text]
  if (where.sinceSeq != null) {
    params.push(where.sinceSeq)
    clauses.push(`${col(spec, 'seq')} > $${params.length}`)
  }
  if (where.state != null) {
    params.push(where.state)
    clauses.push(`(${col(spec, 'commit')}->>'state') = $${params.length}`)
  }
  const limit = size > 0 ? ` LIMIT ${Math.floor(size) + 1}` : ''
  const rows = await sql.runner.query(
    `SELECT * FROM ${spec.qualified} WHERE ${clauses.join(' AND ')} ORDER BY ${col(spec, 'seq')}, ${col(spec, 'id')}${limit}`, params
  )
  const items = rows.map(row => transitionOf(row, sql))

  return size > 0 && items.length > size ? { items: items.slice(0, size), total: items.length } : { items, total: items.length }
}

export const commitTransition = async (sql: SqlContext, id: string, commit: TransitionCommit): Promise<void> => {
  const spec = sql.tables.transition
  await sql.runner.query(
    `UPDATE ${spec.qualified} SET ${col(spec, 'commit')} = $2::jsonb WHERE ${col(spec, 'id')} = $1`, [id, JSON.stringify(clean(commit))]
  )
}

/**
 * Allocate the next seq — a compare-and-set of `head` on the card row, stamping `headAt`. A card
 * whose create has not folded yet has no row to count on: it allocates `max(seq) + 1` from the log
 * and lets the unique `(card, seq)` index refuse a repeat.
 *
 * @throws {WorkcardConflict}
 */
export const allocateSeq = async (
  sql: SqlContext, card: string, expect: number | null | undefined, at: string
): Promise<number> => {
  const cards = sql.tables.card
  const head = col(cards, 'head')
  const seq = col(cards, 'seq')
  const guarded = expect != null
  const allocated = await sql.runner.query<{ head: number }>(
    `UPDATE ${cards.qualified} SET ${head} = COALESCE(${head}, ${seq}) + 1, ${col(cards, 'headAt')} = $2`
    + ` WHERE ${col(cards, 'id')} = $1${guarded ? ` AND COALESCE(${head}, ${seq}) = $3` : ''} RETURNING ${head} AS head`,
    guarded ? [card, at, expect] : [card, at]
  )
  if (allocated[0] != null) {
    return Number(allocated[0].head)
  }
  const existing = await sql.runner.query<{ head: number }>(
    `SELECT COALESCE(${head}, ${seq}) AS head FROM ${cards.qualified} WHERE ${col(cards, 'id')} = $1`, [card]
  )
  if (existing[0] != null) {
    throw new WorkcardConflict(`${card}:expected:${expect}:head:${existing[0].head}`)
  }
  const last = await lastSeq(sql, card)
  if (guarded && expect !== last) {
    throw new WorkcardConflict(`${card}:expected:${expect}:head:${last}`)
  }

  return last + 1
}

export const lastSeq = async (sql: SqlContext, card: string): Promise<number> => {
  const spec = sql.tables.transition
  const rows = await sql.runner.query<{ last: number }>(
    `SELECT COALESCE(MAX(${col(spec, 'seq')}), 0) AS last FROM ${spec.qualified} WHERE ${col(spec, 'card')} = $1`, [card]
  )
  return Number(rows[0]?.last ?? 0)
}

/** Give an allocation back when its append failed and nothing was allocated after it. */
const releaseSeq = async (sql: SqlContext, card: string, seq: number): Promise<void> => {
  const cards = sql.tables.card
  await sql.runner.query(
    `UPDATE ${cards.qualified} SET ${col(cards, 'head')} = $2 - 1 WHERE ${col(cards, 'id')} = $1 AND ${col(cards, 'head')} = $2`,
    [card, seq]
  )
}

export interface TransitionPortDeps {
  sql: () => Promise<SqlContext>
  resource: () => PlanningTransitionResource
  ids: () => string
  now: () => string
  /** The card-seq and entity-key unique index names — how a violation is told apart. */
  indexes: () => Promise<{ cardSeq: string, entityKey: string }>
}

/**
 * The log port. `append` is idempotent on its id; a lost race on the key releases the allocation
 * and answers `PlanningError('duplicate-key')` (the executor then answers the winner's receipt); a
 * lost race on `(card, seq)` — an allocation the fold gave up for lost and filled with a failed
 * placeholder — re-allocates once and lands after it, then refuses with `WorkcardConflict`.
 */
export const makeTransitionPort = (deps: TransitionPortDeps): TransitionStore => {
  const insert = async (sql: SqlContext, transition: Transition): Promise<Transition> => {
    const statement = insertOf(sql.tables.transition, transition as unknown as Record<string, unknown>, { tail: 'RETURNING *' })
    const rows = await sql.runner.query(statement.text, statement.params)
    return transitionOf(rows[0], sql)
  }

  const store: TransitionStore = {
    append: async transition => {
      const sql = await deps.sql()
      const indexes = await deps.indexes()
      let current: Transition = {
        ...transition, id: transition.id ?? deps.ids(), commit: transition.commit ?? { state: CommitState.Pending },
      }
      for (let attempt = 0; ; attempt++) {
        try {
          return await insert(sql, current)
        } catch (error) {
          const fault = pgFault(error)
          if (fault.code !== UNIQUE_VIOLATION) {
            await releaseSeq(sql, current.card, current.seq).catch(() => undefined)
            throw error
          }
          if (fault.constraint === indexes.entityKey) {
            await releaseSeq(sql, current.card, current.seq)
            throw new PlanningError(`duplicate-key:${current.key}`)
          }
          if (fault.constraint === indexes.cardSeq) {
            if (attempt === 0 && current.seq > 1) {
              current = { ...current, seq: await allocateSeq(sql, current.card, null, deps.now()) }
              continue
            }
            throw new WorkcardConflict(`${current.card}:seq:${current.seq}`)
          }
          const existing = await readTransition(sql, current.id!)
          if (existing != null) {
            return existing
          }
          throw error
        }
      }
    },

    get: async id => await readTransition(await deps.sql(), id),

    byKey: async (entityId, key) => await readTransitionByKey(await deps.sql(), entityId, key),

    list: async (where, opts) => {
      await deps.sql()
      const sort: Sort<Transition>[] = opts?.sort ?? (typeof where.card === 'string' ? ['seq'] : ['at', 'seq'])
      const listed = await deps.resource().list(transitionCriteria(where), { ...opts, sort })
      return { ...listed, items: listed.items.map(item => cleanRecord(item)) }
    },

    nextSeq: async (card, expect) => await allocateSeq(await deps.sql(), card, expect, deps.now()),

    head: async card => {
      const sql = await deps.sql()
      const cards = sql.tables.card
      const rows = await sql.runner.query<{ head: number }>(
        `SELECT COALESCE(${col(cards, 'head')}, ${col(cards, 'seq')}) AS head FROM ${cards.qualified} WHERE ${col(cards, 'id')} = $1`, [card]
      )
      return rows[0] != null ? Number(rows[0].head) : await lastSeq(sql, card)
    },

    commit: async (id, commit) => { await commitTransition(await deps.sql(), id, commit) },

    purge: async where => {
      await deps.sql()
      return await deps.resource().purge(transitionCriteria(where))
    },
  }

  return store
}
