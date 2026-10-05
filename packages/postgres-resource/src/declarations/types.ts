import type { PostgresDeclaration } from '../types.js'

/**
 * The per-alias declaration store every postgres resource maker reads and extends — schema,
 * indexes and migrations, keyed by resource alias.
 */
export interface PgDeclarationHelper {
  /** The declaration of an alias, created empty on first use. */
  getDeclaration: (alias: string) => PostgresDeclaration
  /** Testing seam — drops every declaration so a spec can redeclare a resource from scratch. */
  resetDeclarations: (alias?: string) => void
}
