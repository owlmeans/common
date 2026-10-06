import type { MongoDeclaration } from '../types.js'

/**
 * The per-alias declaration store every mongo resource maker reads and extends — migrations and
 * declared references, keyed by resource alias.
 */
export interface MongoDeclarationHelper {
  /** The declaration of an alias, created empty on first use. */
  getDeclaration: (alias: string) => MongoDeclaration
  /** Testing seam — drops every declaration so a spec can redeclare a resource from scratch. */
  resetDeclarations: (alias?: string) => void
}
