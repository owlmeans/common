import { quoteIdent, rowToRecord, type ColumnSpec, type TableSpec } from '@owlmeans/postgres-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import type { Pool, PoolClient, QueryResultRow } from 'pg'
import type { SqlHelper } from './sql/types.js'
import type { InsertStatement, SqlRunner } from './types.js'

export const createSqlHelper = (): SqlHelper => {
  const poolRunner = (pool: Pool): SqlRunner => ({
    query: async <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) =>
      (await pool.query<R>(text, params as never[])).rows,
  })

  const clientRunner = (client: PoolClient, onError?: (error: unknown) => void): SqlRunner => ({
    query: async <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => {
      try {
        return (await client.query<R>(text, params as never[])).rows
      } catch (error) {
        onError?.(error)
        throw error
      }
    },
  })

  const col = (spec: TableSpec, property: string): string => quoteIdent(spec.byProperty[property].column)

  const driverValue = (column: ColumnSpec, value: unknown): unknown => {
    if (value === undefined || value === null) {
      return null
    }
    // node-postgres would write a JS array as a Postgres array literal, which a jsonb column refuses.
    return column.jsonb ? JSON.stringify(value) : value
  }

  const recordOf = <T extends ResourceRecord>(
    row: Record<string, unknown>, spec: TableSpec, hidden: readonly string[] = []
  ): T => {
    const record = rowToRecord<T>(row, spec) as Record<string, unknown>
    for (const [key, value] of Object.entries(record)) {
      if (value === null || hidden.includes(key)) {
        delete record[key]
      }
    }
    return record as T
  }

  const cleanRecord = <T extends object>(record: T, hidden: readonly string[] = []): T =>
    Object.fromEntries(Object.entries(record).filter(([key, value]) => value !== null && value !== undefined && !hidden.includes(key))) as T

  const insertOf = (
    spec: TableSpec, record: Record<string, unknown>, opts: { skip?: readonly string[], tail?: string, as?: string } = {}
  ): InsertStatement => {
    const columns = spec.columns.filter(column => !(opts.skip ?? []).includes(column.property))
    const params = columns.map(column => driverValue(column, record[column.property]))

    return {
      text: `INSERT INTO ${spec.qualified}${opts.as != null ? ` AS ${opts.as}` : ''}`
        + ` (${columns.map(column => quoteIdent(column.column)).join(', ')})`
        + ` VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})${opts.tail != null ? ` ${opts.tail}` : ''}`,
      params,
    }
  }

  const whereOf = (
    spec: TableSpec, fields: Record<string, string | readonly string[] | undefined>, offset: number = 0
  ): { text: string, params: unknown[] } => {
    const clauses: string[] = []
    const params: unknown[] = []
    for (const [property, value] of Object.entries(fields)) {
      if (value === undefined) {
        continue
      }
      params.push(Array.isArray(value) ? [...value] : value)
      clauses.push(Array.isArray(value)
        ? `${col(spec, property)} = ANY($${offset + params.length})`
        : `${col(spec, property)} = $${offset + params.length}`)
    }

    return { text: clauses.length > 0 ? clauses.join(' AND ') : 'TRUE', params }
  }

  const pgFault = (error: unknown): { code?: string, constraint?: string } => {
    let current: unknown = error
    for (let depth = 0; depth < 5 && current != null && typeof current === 'object'; depth++) {
      const candidate = current as { code?: unknown, constraint?: unknown, cause?: unknown }
      if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) {
        return {
          code: candidate.code,
          ...(typeof candidate.constraint === 'string' ? { constraint: candidate.constraint } : {}),
        }
      }
      current = candidate.cause
    }
    return {}
  }

  return { poolRunner, clientRunner, col, driverValue, recordOf, cleanRecord, insertOf, whereOf, pgFault }
}

export const sqlHelper = createSqlHelper()

/** @deprecated compat:factory-refactor — use `sqlHelper.poolRunner(…)` */
export const poolRunner = (pool: Pool): SqlRunner => sqlHelper.poolRunner(pool)

/** @deprecated compat:factory-refactor — use `sqlHelper.clientRunner(…)` */
export const clientRunner = (client: PoolClient, onError?: (error: unknown) => void): SqlRunner =>
  sqlHelper.clientRunner(client, onError)

/** @deprecated compat:factory-refactor — use `sqlHelper.col(…)` */
export const col = (spec: TableSpec, property: string): string => sqlHelper.col(spec, property)

/** @deprecated compat:factory-refactor — use `sqlHelper.driverValue(…)` */
export const driverValue = (column: ColumnSpec, value: unknown): unknown => sqlHelper.driverValue(column, value)

/** @deprecated compat:factory-refactor — use `sqlHelper.recordOf(…)` */
export const recordOf = <T extends ResourceRecord>(
  row: Record<string, unknown>, spec: TableSpec, hidden: readonly string[] = []
): T => sqlHelper.recordOf<T>(row, spec, hidden)

/** @deprecated compat:factory-refactor — use `sqlHelper.cleanRecord(…)` */
export const cleanRecord = <T extends object>(record: T, hidden: readonly string[] = []): T =>
  sqlHelper.cleanRecord<T>(record, hidden)

/** @deprecated compat:factory-refactor — use `sqlHelper.insertOf(…)` */
export const insertOf = (
  spec: TableSpec, record: Record<string, unknown>, opts: { skip?: readonly string[], tail?: string, as?: string } = {}
): InsertStatement => sqlHelper.insertOf(spec, record, opts)

/** @deprecated compat:factory-refactor — use `sqlHelper.whereOf(…)` */
export const whereOf = (
  spec: TableSpec, fields: Record<string, string | readonly string[] | undefined>, offset: number = 0
): { text: string, params: unknown[] } => sqlHelper.whereOf(spec, fields, offset)

/** @deprecated compat:factory-refactor — use `sqlHelper.pgFault(…)` */
export const pgFault = (error: unknown): { code?: string, constraint?: string } => sqlHelper.pgFault(error)
