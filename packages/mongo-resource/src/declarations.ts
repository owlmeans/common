import { createMigrationRegistry } from '@owlmeans/resource'
import type { MigrationRegistry } from '@owlmeans/resource'

import type { MongoReference, MongoTx } from './types.js'

export interface MongoDeclaration {
  migrations: MigrationRegistry<MongoTx>
  /** Declared ObjectId references, keyed by field. Registered via `resource.reference()`. */
  references: Map<string, MongoReference>
}

/**
 * Per-alias migration store, held at module scope rather than on the resource object.
 *
 * A maker may run more than once for the same alias — a custom maker wrapping the built-in
 * one, a maker called again by an app or a spec. Keying the declarations by alias makes
 * that a no-op: every run reads and extends the same registry, so nothing a caller declared
 * by chaining onto an earlier resource object is lost. Losing a migration is silent — the
 * data transformation simply never runs — which is why the store cannot live on the object.
 */
const declarations: Map<string, MongoDeclaration> = new Map()

export const getDeclaration = (alias: string): MongoDeclaration => {
  let declaration = declarations.get(alias)
  if (declaration == null) {
    declaration = { migrations: createMigrationRegistry<MongoTx>(), references: new Map() }
    declarations.set(alias, declaration)
  }

  return declaration
}

/** Testing seam — drops every declaration so a spec can redeclare a resource from scratch. */
export const resetDeclarations = (alias?: string): void => {
  if (alias == null) {
    declarations.clear()

    return
  }
  declarations.delete(alias)
}
