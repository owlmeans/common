import { memoHelper } from '@owlmeans/context'
import type { Workcard } from '@owlmeans/planning'
import { PlanningPostgresError } from '../errors.js'
import { sqlHelper } from '../sql.js'
import type { PlanningCardRecord, SqlContext } from '../types.js'
import type { CardSqlHelper } from './card-sql/types.js'
import { CARD_PRIVATE } from './consts.js'
import { pgNameHelper } from '@owlmeans/postgres-resource'

export const makeCardSqlHelper = (sql: SqlContext): CardSqlHelper => {
  const { col, cleanRecord, driverValue, insertOf, recordOf } = sqlHelper

  const readCardRow = async (id: string, entityId?: string): Promise<PlanningCardRecord | null> => {
    const spec = sql.tables.card
    const rows = await sql.runner.query(
      `SELECT * FROM ${spec.qualified} WHERE ${col(spec, 'id')} = $1${entityId != null ? ` AND ${col(spec, 'entityId')} = $2` : ''}`,
      entityId != null ? [id, entityId] : [id]
    )
    return rows[0] == null ? null : recordOf<PlanningCardRecord>(rows[0], spec)
  }

  const readCard = async (id: string, entityId: string): Promise<Workcard | null> => {
    const row = await readCardRow(id, entityId)
    return row == null ? null : cleanRecord(row, CARD_PRIVATE)
  }

  const writeCard = async (card: Workcard): Promise<void> => {
    const spec = sql.tables.card
    if (card.id == null) {
      throw new PlanningPostgresError('malformed:put-without-id')
    }
    const record = { ...card, head: Math.max(card.head ?? card.seq, card.seq) } as Record<string, unknown>
    const head = col(spec, 'head')
    const seq = col(spec, 'seq')
    const assigned = spec.columns
      .filter(column => !['id', 'headAt', 'head'].includes(column.property))
      .map(column => column.column)

    if (card.seq <= 1) {
      const insert = insertOf(spec, record, {
        skip: CARD_PRIVATE,
        as: 'existing',
        tail: `ON CONFLICT (${col(spec, 'id')}) DO UPDATE SET `
          + [...assigned.map(name => `${pgNameHelper.quoteIdent(name)} = EXCLUDED.${pgNameHelper.quoteIdent(name)}`),
            `${head} = GREATEST(COALESCE(existing.${head}, existing.${seq}), EXCLUDED.${head})`].join(', '),
      })
      await sql.runner.query(insert.text, insert.params)
      return
    }

    const columns = spec.columns.filter(column => assigned.includes(column.column))
    const params = [card.id, ...columns.map(column => driverValue(column, record[column.property])), record.head]
    const updated = await sql.runner.query(
      `UPDATE ${spec.qualified} SET ${columns.map((column, index) => `${pgNameHelper.quoteIdent(column.column)} = $${index + 2}`).join(', ')},`
      + ` ${head} = GREATEST(COALESCE(${head}, ${seq}), $${columns.length + 2}) WHERE ${col(spec, 'id')} = $1 RETURNING ${col(spec, 'id')}`,
      params
    )
    if (updated.length === 0) {
      throw new PlanningPostgresError(`fold:card-vanished:${card.id}`)
    }
  }

  const dropCard = async (id: string, entityId: string): Promise<void> => {
    const spec = sql.tables.card
    await sql.runner.query(
      `DELETE FROM ${spec.qualified} WHERE ${col(spec, 'id')} = $1 AND ${col(spec, 'entityId')} = $2`, [id, entityId]
    )
  }

  return { readCardRow, readCard, writeCard, dropCard }
}

/** The card statements of one runner and table set — one per `SqlContext`. */
export const cardSqlOf = memoHelper.oncePer(makeCardSqlHelper)
