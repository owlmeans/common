import { memoHelper } from '@owlmeans/context'
import { WorkcardConflict, type Transition, type TransitionCommit, type TransitionWhere } from '@owlmeans/planning'
import type { ListResult } from '@owlmeans/resource'
import { sqlHelper } from '../sql.js'
import type { SqlContext } from '../types.js'
import type { TransitionSqlHelper } from './transition-sql/types.js'

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

export const makeTransitionSqlHelper = (sql: SqlContext): TransitionSqlHelper => {
  const { col, recordOf, whereOf } = sqlHelper

  const transitionOf = (row: Record<string, unknown>): Transition =>
    recordOf<Transition>(row, sql.tables.transition)

  const readTransition = async (id: string): Promise<Transition | null> => {
    const spec = sql.tables.transition
    const rows = await sql.runner.query(`SELECT * FROM ${spec.qualified} WHERE ${col(spec, 'id')} = $1`, [id])
    return rows[0] == null ? null : transitionOf(rows[0])
  }

  const readTransitionByKey = async (entityId: string, key: string): Promise<Transition | null> => {
    const spec = sql.tables.transition
    const rows = await sql.runner.query(
      `SELECT * FROM ${spec.qualified} WHERE ${col(spec, 'entityId')} = $1 AND ${col(spec, 'key')} = $2`, [entityId, key]
    )
    return rows[0] == null ? null : transitionOf(rows[0])
  }

  const listTransitions = async (where: TransitionWhere, size: number = 0): Promise<ListResult<Transition>> => {
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
    const items = rows.map(row => transitionOf(row))

    return size > 0 && items.length > size ? { items: items.slice(0, size), total: items.length } : { items, total: items.length }
  }

  const commitTransition = async (id: string, commit: TransitionCommit): Promise<void> => {
    const spec = sql.tables.transition
    await sql.runner.query(
      `UPDATE ${spec.qualified} SET ${col(spec, 'commit')} = $2::jsonb WHERE ${col(spec, 'id')} = $1`, [id, JSON.stringify(clean(commit))]
    )
  }

  const allocateSeq = async (card: string, expect: number | null | undefined, at: string): Promise<number> => {
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
    const last = await lastSeq(card)
    if (guarded && expect !== last) {
      throw new WorkcardConflict(`${card}:expected:${expect}:head:${last}`)
    }

    return last + 1
  }

  const lastSeq = async (card: string): Promise<number> => {
    const spec = sql.tables.transition
    const rows = await sql.runner.query<{ last: number }>(
      `SELECT COALESCE(MAX(${col(spec, 'seq')}), 0) AS last FROM ${spec.qualified} WHERE ${col(spec, 'card')} = $1`, [card]
    )
    return Number(rows[0]?.last ?? 0)
  }

  return { transitionOf, readTransition, readTransitionByKey, listTransitions, commitTransition, allocateSeq, lastSeq }
}

/** The log statements of one runner and table set — one per `SqlContext`. */
export const transitionSqlOf = memoHelper.oncePer(makeTransitionSqlHelper)
