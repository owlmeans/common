import { PgErrorCode } from '../consts.js'

export const COMPARISON: Record<string, string> = {
  $eq: '=', $ne: '<>', $gt: '>', $gte: '>=', $lt: '<', $lte: '<='
}

/** A type cast as `pg_get_expr` / `pg_get_indexdef` print one: `::text`, `::character varying(64)[]`. */
export const CAST = /::(?:character varying|double precision|bit varying|timestamp with(?:out)? time zone|time with(?:out)? time zone|[a-z_][a-z0-9_]*)(?:\(\d+(?:\s*,\s*\d+)?\))?(?:\[\])?/g

/**
 * `pg_attribute` + `format_type` rather than `information_schema.columns`, because it
 * returns one canonical type string with the typmod already baked in
 * (`character varying(320)`). `information_schema` splits the same information across
 * four columns and reports every array as `ARRAY`, which no comparison can use.
 */
export const COLUMNS = `
  SELECT a.attname                            AS name,
         format_type(a.atttypid, a.atttypmod) AS type,
         a.attnotnull                         AS not_null,
         pg_get_expr(d.adbin, d.adrelid)      AS default_expr,
         a.attidentity                        AS identity,
         a.attgenerated                       AS generated,
         a.attnum                             AS ordinal
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = to_regclass($1) AND a.attnum > 0 AND NOT a.attisdropped
   ORDER BY a.attnum
`

export const INDEXES = `
  SELECT indexname AS name, indexdef AS definition
    FROM pg_indexes
   WHERE schemaname = $1 AND tablename = $2
`

export const CONSTRAINTS = `
  SELECT c.conname AS name, c.contype AS type, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
   WHERE c.conrelid = to_regclass($1)
     AND c.contype <> 'n'
`

export const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/

/**
 * `{{ }}` / `{{self}}`      — the owning resource's qualified table
 * `{{alias}}`               — another registered postgres resource's qualified table
 * `{{alias.property}}`      — a qualified column of that resource
 * `{{#alias}}`              — the bare quoted table name, for `ON CONFLICT ON CONSTRAINT`
 * `{{$}}`                   — the owning resource's quoted schema
 *
 * Resource aliases in this codebase use `-` and `:` but never `.`, so `.` is unambiguous
 * as the column separator.
 */
export const PLACEHOLDER = /\{\{\s*([#$]?)([A-Za-z0-9_:-]*)(?:\.([A-Za-z0-9_]+))?\s*\}\}/g

/**
 * Codes that mean "the cast is legal, the data isn't": a `text` column holding `'a'` retyped to
 * `integer`, a value too wide for the new length, a number past the new range. Postgres refuses
 * each of these rather than truncating, and the remedy is the same one a refused cast needs — so
 * they are only read as a cast problem here, inside DDL. On the CRUD path the identical code means
 * a caller passed a bad value, which is a different bug with a different fix.
 */
export const CAST_DATA_CODES: string[] = [
  PgErrorCode.InvalidTextRepresentation,
  PgErrorCode.StringDataRightTruncation,
  PgErrorCode.NumericValueOutOfRange
]

/** The largest `integer` column value; a schema `maximum` past it needs `bigint`. */
export const INT32_MAX = 2147483647
