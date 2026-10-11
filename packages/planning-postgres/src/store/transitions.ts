import { CommitState, PlanningError, WorkcardConflict, type Transition, type TransitionCommit, type TransitionStore, type TransitionWhere } from '@owlmeans/planning'
import type { Criteria, ListResult, Sort } from '@owlmeans/resource'
import { sqlHelper } from '../sql.js'
import { UNIQUE_VIOLATION } from '../consts.js'
import type { SqlContext } from '../types.js'
import { transitionSqlOf } from './transition-sql.js'
import type { TransitionPortDeps } from './types.js'

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

/**
 * The log port. `append` is idempotent on its id; a lost race on the key releases the allocation
 * and answers `PlanningError('duplicate-key')` (the executor then answers the winner's receipt); a
 * lost race on `(card, seq)` — an allocation the fold gave up for lost and filled with a failed
 * placeholder — re-allocates once and lands after it, then refuses with `WorkcardConflict`.
 */
export const makeTransitionPort = (deps: TransitionPortDeps): TransitionStore => {
  const { col, cleanRecord, insertOf, pgFault } = sqlHelper

  const insert = async (sql: SqlContext, transition: Transition): Promise<Transition> => {
    const statement = insertOf(sql.tables.transition, transition as unknown as Record<string, unknown>, { tail: 'RETURNING *' })
    const rows = await sql.runner.query(statement.text, statement.params)
    return transitionSqlOf(sql).transitionOf(rows[0])
  }

  /** Give an allocation back when its append failed and nothing was allocated after it. */
  const releaseSeq = async (sql: SqlContext, card: string, seq: number): Promise<void> => {
    const cards = sql.tables.card
    await sql.runner.query(
      `UPDATE ${cards.qualified} SET ${col(cards, 'head')} = $2 - 1 WHERE ${col(cards, 'id')} = $1 AND ${col(cards, 'head')} = $2`,
      [card, seq]
    )
  }

  const store: TransitionStore = {
    append: async transition => {
      const sql = await deps.sql()
      const statements = transitionSqlOf(sql)
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
              current = { ...current, seq: await statements.allocateSeq(current.card, null, deps.now()) }
              continue
            }
            throw new WorkcardConflict(`${current.card}:seq:${current.seq}`)
          }
          const existing = await statements.readTransition(current.id!)
          if (existing != null) {
            return existing
          }
          throw error
        }
      }
    },

    get: async id => await transitionSqlOf(await deps.sql()).readTransition(id),

    byKey: async (entityId, key) => await transitionSqlOf(await deps.sql()).readTransitionByKey(entityId, key),

    list: async (where, opts) => {
      await deps.sql()
      const sort: Sort<Transition>[] = opts?.sort ?? (typeof where.card === 'string' ? ['seq'] : ['at', 'seq'])
      const listed = await deps.resource().list(transitionCriteria(where), { ...opts, sort })
      return { ...listed, items: listed.items.map(item => cleanRecord(item)) }
    },

    nextSeq: async (card, expect) => await transitionSqlOf(await deps.sql()).allocateSeq(card, expect, deps.now()),

    head: async card => {
      const sql = await deps.sql()
      const cards = sql.tables.card
      const rows = await sql.runner.query<{ head: number }>(
        `SELECT COALESCE(${col(cards, 'head')}, ${col(cards, 'seq')}) AS head FROM ${cards.qualified} WHERE ${col(cards, 'id')} = $1`, [card]
      )
      return rows[0] != null ? Number(rows[0].head) : await transitionSqlOf(sql).lastSeq(card)
    },

    commit: async (id, commit) => { await transitionSqlOf(await deps.sql()).commitTransition(id, commit) },

    purge: async where => {
      await deps.sql()
      return await deps.resource().purge(transitionCriteria(where))
    },
  }

  return store
}

/** @deprecated compat:factory-refactor — use `transitionSqlOf(sql).transitionOf(…)` */
export const transitionOf = (row: Record<string, unknown>, sql: SqlContext): Transition => transitionSqlOf(sql).transitionOf(row)

/** @deprecated compat:factory-refactor — use `transitionSqlOf(sql).readTransition(…)` */
export const readTransition = async (sql: SqlContext, id: string): Promise<Transition | null> =>
  await transitionSqlOf(sql).readTransition(id)

/** @deprecated compat:factory-refactor — use `transitionSqlOf(sql).readTransitionByKey(…)` */
export const readTransitionByKey = async (sql: SqlContext, entityId: string, key: string): Promise<Transition | null> =>
  await transitionSqlOf(sql).readTransitionByKey(entityId, key)

/** @deprecated compat:factory-refactor — use `transitionSqlOf(sql).listTransitions(…)` */
export const listTransitions = async (
  sql: SqlContext, where: TransitionWhere, size: number = 0
): Promise<ListResult<Transition>> => await transitionSqlOf(sql).listTransitions(where, size)

/** @deprecated compat:factory-refactor — use `transitionSqlOf(sql).commitTransition(…)` */
export const commitTransition = async (sql: SqlContext, id: string, commit: TransitionCommit): Promise<void> =>
  await transitionSqlOf(sql).commitTransition(id, commit)

/** @deprecated compat:factory-refactor — use `transitionSqlOf(sql).allocateSeq(…)` */
export const allocateSeq = async (
  sql: SqlContext, card: string, expect: number | null | undefined, at: string
): Promise<number> => await transitionSqlOf(sql).allocateSeq(card, expect, at)

/** @deprecated compat:factory-refactor — use `transitionSqlOf(sql).lastSeq(…)` */
export const lastSeq = async (sql: SqlContext, card: string): Promise<number> => await transitionSqlOf(sql).lastSeq(card)
