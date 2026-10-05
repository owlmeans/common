import type { PoolClient } from 'pg'

import type { LiveColumn, LiveConstraint, LiveIndex, LiveTable } from '../types.js'
import { COLUMNS, CONSTRAINTS, INDEXES } from './consts.local.js'
import type { PgIntrospectHelper } from './introspect/types.js'

export const makePgIntrospectHelper = (client: PoolClient): PgIntrospectHelper => {
  const introspectTable = async (
    schema: string, table: string, qualified: string
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

  const countNonNull = async (qualified: string, column: string): Promise<number> => {
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

  return { introspectTable, countNonNull }
}

/** @deprecated compat:factory-refactor — use `makePgIntrospectHelper(client).introspectTable(…)` */
export const introspectTable = async (
  client: PoolClient, schema: string, table: string, qualified: string
): Promise<LiveTable> => makePgIntrospectHelper(client).introspectTable(schema, table, qualified)
