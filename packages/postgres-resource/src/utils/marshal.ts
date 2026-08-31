import type { ResourceRecord } from '@owlmeans/resource'
import { types as pgTypes } from 'pg'

import { ID_FIELD, PgTypeOid } from '../consts.js'
import type { ColumnSpec, TableSpec } from '../types.js'

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

const fromDriver = (value: unknown, column: ColumnSpec): unknown => {
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
        console.warn(
          `@owlmeans/postgres-resource: "${column.column}" holds ${value}, which exceeds the safe`
          + ' integer range — the value read back is imprecise.'
        )
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

/**
 * Turn a driver row into a record: physical column names back to schema property names,
 * plus the coercions node-postgres leaves to the caller.
 *
 * Columns the spec doesn't know about — computed expressions, joined columns from custom
 * SQL — are kept verbatim. A join result is more useful than a lossy projection.
 */
export const rowToRecord = <T extends ResourceRecord>(row: Record<string, unknown>, spec: TableSpec): T => {
  const record: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const column = spec.byColumn[key]
    if (column == null) {
      record[key] = value
      continue
    }
    record[column.property] = fromDriver(value, column)
  }
  if (record[ID_FIELD] != null) {
    record[ID_FIELD] = `${record[ID_FIELD]}`
  }

  return record as T
}

/**
 * Same coercion as {@link rowToRecord}, for rows Drizzle produced.
 *
 * Drizzle keys its results by the table object's JS property names — which are the schema
 * property names — where raw SQL returns physical column names. Two functions rather than
 * one lookup that tries both, because a schema that renames `a` to column `b` while another
 * property is itself named `b` would make the combined lookup pick the wrong spec.
 */
export const resultToRecord = <T extends ResourceRecord>(
  row: Record<string, unknown>, spec: TableSpec
): T => {
  const record: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const column = spec.byProperty[key]
    record[key] = column == null ? value : fromDriver(value, column)
  }
  if (record[ID_FIELD] != null) {
    record[ID_FIELD] = `${record[ID_FIELD]}`
  }

  return record as T
}

/**
 * Turn a record into the values Drizzle inserts, keyed by property name (Drizzle owns the
 * property to column mapping).
 *
 * `undefined` properties are dropped so a partial write touches only what was supplied;
 * an explicit `null` is kept, because nulling a column is a real intent.
 */
export const recordToValues = (record: Record<string, unknown>, spec: TableSpec): Record<string, unknown> => {
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

/**
 * Every managed column, with anything the record omits explicitly nulled.
 *
 * This is what makes `update()` a replace rather than a merge — the semantics mongo's
 * `replaceOne` gives, kept identical so a resource behaves the same on either backend.
 * The primary key and unmanaged columns are never nulled.
 */
export const recordToFullValues = (
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
