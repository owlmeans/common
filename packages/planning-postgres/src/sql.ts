import { quoteIdent, rowToRecord } from '@owlmeans/postgres-resource'
import type { ColumnSpec, TableSpec } from '@owlmeans/postgres-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import type { Pool, PoolClient, QueryResultRow } from 'pg'

/** Where a statement runs — the pool, or one open transaction. */
export interface SqlRunner {
  query: <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<R[]>
}

/** The compiled specs of the four tables, read once the resources have initialized. */
export interface PlanningTables {
  card: TableSpec
  transition: TableSpec
  link: TableSpec
  schema: TableSpec
}

/** A runner and the tables it addresses — what every statement builder takes. */
export interface SqlContext {
  runner: SqlRunner
  tables: PlanningTables
}

export const poolRunner = (pool: Pool): SqlRunner => ({
  query: async <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) =>
    (await pool.query<R>(text, params as never[])).rows,
})

export const clientRunner = (client: PoolClient, onError?: (error: unknown) => void): SqlRunner => ({
  query: async <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => {
    try {
      return (await client.query<R>(text, params as never[])).rows
    } catch (error) {
      onError?.(error)
      throw error
    }
  },
})

/** A property's physical column, quoted. */
export const col = (spec: TableSpec, property: string): string => quoteIdent(spec.byProperty[property].column)

/** A value as the driver takes it for a column: JSON text for jsonb, `null` for absent. */
export const driverValue = (column: ColumnSpec, value: unknown): unknown => {
  if (value === undefined || value === null) {
    return null
  }
  // node-postgres would write a JS array as a Postgres array literal, which a jsonb column refuses.
  return column.jsonb ? JSON.stringify(value) : value
}

/**
 * A row back as a record: physical columns to properties with the package's coercions, `null`
 * dropped (the planning records leave an absent value out), private columns removed.
 */
export const recordOf = <T extends ResourceRecord>(
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

/** A resource read answered with drizzle's property-keyed rows: `null` and private keys dropped. */
export const cleanRecord = <T extends object>(record: T, hidden: readonly string[] = []): T =>
  Object.fromEntries(Object.entries(record).filter(([key, value]) => value !== null && value !== undefined && !hidden.includes(key))) as T

export interface InsertStatement {
  text: string
  params: unknown[]
}

/**
 * `INSERT INTO <table> (<every column but the skipped>) VALUES (…)` for a record, with an optional
 * tail (`ON CONFLICT …`, `RETURNING …`).
 */
export const insertOf = (
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

/**
 * A WHERE over fixed fields: a string is equality, a list is `= ANY`, `undefined` is skipped.
 * Parameters start after `offset`.
 */
export const whereOf = (
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

/** The driver error's Postgres code and the constraint (index) it names, through a `cause` chain. */
export const pgFault = (error: unknown): { code?: string, constraint?: string } => {
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

export const UNIQUE_VIOLATION = '23505'
export const LOCK_NOT_AVAILABLE = '55P03'
