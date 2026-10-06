import type { PgRuntimeTable, TableSpec } from '../types.js'
import type { MigrationReport } from '@owlmeans/resource'
import type { BasicContext } from '@owlmeans/context'

export interface TableInit {
  spec: TableSpec
  /** The Drizzle table CRUD is built against. */
  entity: PgRuntimeTable
  reports: MigrationReport[]
}

/**
 * The context a placeholder resolves through.
 *
 * Resolution reads exactly one thing — `context.resource(alias).table` — so the config a context
 * carries is irrelevant here, and pinning one would force every caller holding a server context
 * to cast its way in. Deliberately open, and named so callers pass what they already have.
 */
export type PlaceholderContext = BasicContext<any>
