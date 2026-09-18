import { sql } from 'drizzle-orm'
import { customType, index, pgSchema, primaryKey, uniqueIndex } from 'drizzle-orm/pg-core'

import { PgIndexMethod } from '../consts.js'
import type { PgRuntimeTable, TableSpec } from '../types.js'

/**
 * One universal column builder.
 *
 * Drizzle's typed builders (`text()`, `integer()`, ...) exist to drive compile time
 * inference from a statically declared schema. Our tables are compiled at runtime from
 * JSON Schema, so there's nothing to infer and a per-type switch would buy nothing but a
 * mapping to keep in sync. `customType` lets the already-canonical `sqlType` string
 * through verbatim, and `getSQLType()` reads it straight back for the drift cross-check.
 *
 * Marshalling is deliberately identity here — coercion lives in `marshal.ts`, which is
 * driven by the same spec and also serves the raw-SQL path that never touches Drizzle.
 */
const pgRaw = customType<{ data: unknown, driverData: unknown, config: { sqlType: string } }>({
  dataType: config => config?.sqlType ?? 'text'
})

/**
 * Build the Drizzle table used for CRUD query construction. Structure DDL is emitted from
 * the {@link TableSpec} directly — Drizzle exposes no runtime DDL generator (that lives in
 * drizzle-kit, which would be a second owner of the same tables).
 *
 * The result is stated as a {@link PgRuntimeTable}: the columns exist, keyed by schema
 * property name, but only this function knows which ones — Drizzle's own inference has a
 * literal column map to work from, and here that map was assembled a few lines ago.
 */
export const specToTable = (spec: TableSpec): PgRuntimeTable => {
  const namespace = pgSchema(spec.schema)
  const columns: Record<string, any> = {}

  for (const column of spec.columns) {
    let builder: any = pgRaw(column.column, { sqlType: column.sqlType })
    if (column.notNull) {
      builder = builder.notNull()
    }
    if (column.defaultRaw != null) {
      builder = builder.default(sql.raw(column.defaultRaw))
    } else if (column.defaultLiteral !== undefined) {
      builder = builder.default(column.defaultLiteral)
    }
    /** Composite keys are declared in the extra-config callback instead. */
    if (column.primaryKey && spec.primaryKey.length === 1) {
      builder = builder.primaryKey()
    }
    columns[column.property] = builder
  }

  return namespace.table(spec.table, columns, (table: any) => [
    ...spec.indexes
      .filter(entry => entry.columns != null && entry.columns.length > 0 && entry.expression == null)
      .map(entry => {
        const properties = (entry.columns as string[])
          .map(name => spec.byColumn[name]?.property)
          .filter((name): name is string => name != null && table[name] != null)
        const builder = entry.unique === true ? uniqueIndex(entry.name!) : index(entry.name!)

        /**
         * Both `using` and `primaryKey` want a non-empty tuple of statically known columns.
         * Nothing here is statically known — the columns were compiled a few lines above —
         * so the tuple shape is asserted rather than proven.
         */
        return builder.using(
          entry.method ?? PgIndexMethod.BTree,
          ...properties.map(name => table[name]) as [any, ...any[]]
        )
      }),
    ...(spec.primaryKey.length > 1
      ? [primaryKey({
        columns: spec.primaryKey
          .map(name => table[spec.byColumn[name]?.property ?? name])
          .filter((column: unknown) => column != null) as [any, ...any[]]
      })]
      : [])
  ]) as unknown as PgRuntimeTable
}
