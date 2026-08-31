import type { PoolClient } from 'pg'

import type { LiveColumn, LiveConstraint, LiveIndex, LiveTable } from '../types.js'

/**
 * `pg_attribute` + `format_type` rather than `information_schema.columns`, because it
 * returns one canonical type string with the typmod already baked in
 * (`character varying(320)`). `information_schema` splits the same information across
 * four columns and reports every array as `ARRAY`, which no comparison can use.
 */
const COLUMNS = `
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

const INDEXES = `
  SELECT indexname AS name, indexdef AS definition
    FROM pg_indexes
   WHERE schemaname = $1 AND tablename = $2
`

const CONSTRAINTS = `
  SELECT c.conname AS name, c.contype AS type, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
   WHERE c.conrelid = to_regclass($1)
`

/** Read the table exactly as Postgres currently holds it. */
export const introspectTable = async (
  client: PoolClient, schema: string, table: string, qualified: string
): Promise<LiveTable> => {
  const exists = await client.query<{ present: boolean }>(
    'SELECT to_regclass($1) IS NOT NULL AS present', [qualified]
  )
  if (exists.rows[0]?.present !== true) {
    return { exists: false, columns: [], indexes: [], constraints: [] }
  }

  /**
   * Sequential, not `Promise.all`: this is one checked out connection, and a connection
   * runs one statement at a time. Overlapping them only queues them behind each other —
   * and node-postgres deprecated tolerating it.
   */
  const columns = await client.query<LiveColumn>(COLUMNS, [qualified])
  const indexes = await client.query<LiveIndex>(INDEXES, [schema, table])
  const constraints = await client.query<LiveConstraint>(CONSTRAINTS, [qualified])

  return {
    exists: true,
    columns: columns.rows.map(row => ({
      name: row.name,
      type: row.type,
      notNull: (row as unknown as { not_null: boolean }).not_null,
      defaultExpr: (row as unknown as { default_expr: string | null }).default_expr,
      identity: row.identity ?? '',
      generated: row.generated ?? '',
      ordinal: row.ordinal
    })),
    indexes: indexes.rows,
    constraints: constraints.rows
  }
}

/** Count the rows a destructive step would lose, so the boot log can say how much. */
export const countNonNull = async (
  client: PoolClient, qualified: string, column: string
): Promise<number> => {
  try {
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${qualified} WHERE "${column.replace(/"/g, '""')}" IS NOT NULL`
    )

    return parseInt(result.rows[0]?.count ?? '0', 10)
  } catch {
    /** Never let a diagnostic read break reconciliation. */
    return -1
  }
}
