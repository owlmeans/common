import type { ColumnSpec, TableSpec } from '@owlmeans/postgres-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import type { Pool, PoolClient } from 'pg'
import type { InsertStatement, SqlRunner } from '../types.js'

/** The package's own SQL: where a statement runs, how a value is written, how a row is read back. */
export interface SqlHelper {
  poolRunner: (pool: Pool) => SqlRunner
  clientRunner: (client: PoolClient, onError?: (error: unknown) => void) => SqlRunner
  /** A property's physical column, quoted. */
  col: (spec: TableSpec, property: string) => string
  /** A value as the driver takes it for a column: JSON text for jsonb, `null` for absent. */
  driverValue: (column: ColumnSpec, value: unknown) => unknown
  /**
   * A row back as a record: physical columns to properties with the package's coercions, `null`
   * dropped (the planning records leave an absent value out), private columns removed.
   */
  recordOf: <T extends ResourceRecord>(row: Record<string, unknown>, spec: TableSpec, hidden?: readonly string[]) => T
  /** A resource read answered with drizzle's property-keyed rows: `null` and private keys dropped. */
  cleanRecord: <T extends object>(record: T, hidden?: readonly string[]) => T
  /**
   * `INSERT INTO <table> (<every column but the skipped>) VALUES (…)` for a record, with an optional
   * tail (`ON CONFLICT …`, `RETURNING …`).
   */
  insertOf: (
    spec: TableSpec, record: Record<string, unknown>, opts?: { skip?: readonly string[], tail?: string, as?: string }
  ) => InsertStatement
  /**
   * A WHERE over fixed fields: a string is equality, a list is `= ANY`, `undefined` is skipped.
   * Parameters start after `offset`.
   */
  whereOf: (
    spec: TableSpec, fields: Record<string, string | readonly string[] | undefined>, offset?: number
  ) => { text: string, params: unknown[] }
  /** The driver error's Postgres code and the constraint (index) it names, through a `cause` chain. */
  pgFault: (error: unknown) => { code?: string, constraint?: string }
}
