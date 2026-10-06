import type { ResourceRecord } from '@owlmeans/resource'
import { logThrottle, logger } from '@owlmeans/log'
import { types as pgTypes } from 'pg'

import { ID_FIELD, PgTypeOid } from '../consts.js'
import type { ColumnSpec, TableSpec } from '../types.js'
import type { PgMarshalHelper } from './marshal/types.js'

const log = logger('postgres-resource')

export const createPgMarshalHelper = (): PgMarshalHelper => {
  /**
   * Parse a temporal value the way the driver would have.
   *
   * Drizzle's node-postgres session installs its own `getTypeParser` that hands date and
   * timestamp columns back as raw text, because its own statically declared column types do
   * the conversion. Ours are compiled at runtime and can't, so the driver's parser is called
   * directly — the same function, just later. Raw SQL never comes through here, since that
   * path keeps the driver's default parsers.
   */
  const toDate = (value: string, column: ColumnSpec): unknown => {
    const oid = column.sqlType.startsWith('timestamp with time zone')
      ? PgTypeOid.TimestampTz
      : column.sqlType.startsWith('timestamp')
        ? PgTypeOid.Timestamp
        : PgTypeOid.Date

    return (pgTypes.getTypeParser(oid as never) as (raw: string) => unknown)(value)
  }

  const fromDriver = (value: unknown, column: ColumnSpec, table?: string): unknown => {
    if (value == null) {
      return value
    }
    /** Ciphertext is opaque — coercing it would corrupt it. */
    if (column.secure) {
      return value
    }

    switch (column.jsonType) {
      case 'number':
        /** Postgres returns `numeric` as a string to protect precision the JS number can't hold. */
        return typeof value === 'string' ? parseFloat(value) : value
      case 'integer':
        return typeof value === 'string' ? parseInt(value, 10) : value
      case 'bigint': {
        if (typeof value !== 'string' && typeof value !== 'bigint') {
          return value
        }
        const parsed = Number(value)
        if (!Number.isSafeInteger(parsed)) {
          // Fires per row read: one line per window per column is enough.
          if (logThrottle(`postgres-resource:${table ?? ''}:${column.column}:unsafe-bigint`, 300_000)) {
            log.warn('Bigint column value exceeds the safe integer range; the value read back is imprecise', {
              table, column: column.column,
            })
          }
        }

        return parsed
      }
      case 'binary':
        return Buffer.isBuffer(value) ? value.toString('base64') : value
      case 'date':
        return typeof value === 'string' ? toDate(value, column) : value
      default:
        return value
    }
  }

  const toDriver = (value: unknown, column: ColumnSpec): unknown => {
    if (value == null) {
      return value
    }
    if (column.secure) {
      return value
    }
    if (column.jsonb) {
      /**
       * node-postgres stringifies plain objects on its own but turns arrays into Postgres
       * array literals, which a jsonb column rejects. Stringifying here covers both.
       */
      return typeof value === 'string' ? value : JSON.stringify(value)
    }
    if (column.jsonType === 'date' && !(value instanceof Date)) {
      return new Date(value as string | number)
    }
    if (column.jsonType === 'binary' && typeof value === 'string') {
      return Buffer.from(value, 'base64')
    }

    return value
  }

  const rowToRecord = <T extends ResourceRecord>(row: Record<string, unknown>, spec: TableSpec): T => {
    const record: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      const column = spec.byColumn[key]
      if (column == null) {
        record[key] = value
        continue
      }
      record[column.property] = fromDriver(value, column, spec.qualified)
    }
    if (record[ID_FIELD] != null) {
      record[ID_FIELD] = `${record[ID_FIELD]}`
    }

    return record as T
  }

  const resultToRecord = <T extends ResourceRecord>(
    row: Record<string, unknown>, spec: TableSpec
  ): T => {
    const record: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      const column = spec.byProperty[key]
      record[key] = column == null ? value : fromDriver(value, column, spec.qualified)
    }
    if (record[ID_FIELD] != null) {
      record[ID_FIELD] = `${record[ID_FIELD]}`
    }

    return record as T
  }

  const recordToValues = (record: Record<string, unknown>, spec: TableSpec): Record<string, unknown> => {
    const values: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) {
      const column = spec.byProperty[key]
      if (column == null || value === undefined) {
        continue
      }
      values[column.property] = toDriver(value, column)
    }

    return values
  }

  const recordToFullValues = (
    record: Record<string, unknown>, spec: TableSpec
  ): Record<string, unknown> => {
    const values: Record<string, unknown> = {}
    for (const column of spec.columns) {
      if (spec.primaryKey.includes(column.column) || spec.unmanaged.includes(column.column)) {
        continue
      }
      const value = record[column.property]
      values[column.property] = value === undefined ? null : toDriver(value, column)
    }

    return values
  }

  return { rowToRecord, resultToRecord, recordToValues, recordToFullValues }
}

export const pgMarshalHelper = createPgMarshalHelper()

/** @deprecated compat:factory-refactor — use `pgMarshalHelper.rowToRecord(…)` */
export const rowToRecord = <T extends ResourceRecord>(row: Record<string, unknown>, spec: TableSpec): T =>
  pgMarshalHelper.rowToRecord<T>(row, spec)
