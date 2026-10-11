import type { LiveTable } from '../../types.js'

/** Catalog reads over one checked out connection. */
export interface PgIntrospectHelper {
  /** Read the table exactly as Postgres currently holds it. */
  introspectTable: (schema: string, table: string, qualified: string) => Promise<LiveTable>
  /** Count the rows a destructive step would lose, so the boot log can say how much. */
  countNonNull: (qualified: string, column: string) => Promise<number>
}
