import type { ResourceRecord } from '@owlmeans/resource'

import type { TableSpec } from '../../types.js'

/** Records to driver values and back, driven by a compiled table spec. */
export interface PgMarshalHelper {
  /**
   * Turn a driver row into a record: physical column names back to schema property names,
   * plus the coercions node-postgres leaves to the caller.
   *
   * Columns the spec doesn't know about — computed expressions, joined columns from custom
   * SQL — are kept verbatim. A join result is more useful than a lossy projection.
   */
  rowToRecord: <T extends ResourceRecord>(row: Record<string, unknown>, spec: TableSpec) => T
  /**
   * Same coercion as {@link PgMarshalHelper.rowToRecord}, for rows Drizzle produced.
   *
   * Drizzle keys its results by the table object's JS property names — which are the schema
   * property names — where raw SQL returns physical column names. Two functions rather than
   * one lookup that tries both, because a schema that renames `a` to column `b` while another
   * property is itself named `b` would make the combined lookup pick the wrong spec.
   */
  resultToRecord: <T extends ResourceRecord>(row: Record<string, unknown>, spec: TableSpec) => T
  /**
   * Turn a record into the values Drizzle inserts, keyed by property name (Drizzle owns the
   * property to column mapping).
   *
   * `undefined` properties are dropped so a partial write touches only what was supplied;
   * an explicit `null` is kept, because nulling a column is a real intent.
   */
  recordToValues: (record: Record<string, unknown>, spec: TableSpec) => Record<string, unknown>
  /**
   * Every managed column, with anything the record omits explicitly nulled.
   *
   * This is what makes `update()` a replace rather than a merge — the semantics mongo's
   * `replaceOne` gives, kept identical so a resource behaves the same on either backend.
   * The primary key and unmanaged columns are never nulled.
   */
  recordToFullValues: (record: Record<string, unknown>, spec: TableSpec) => Record<string, unknown>
}
