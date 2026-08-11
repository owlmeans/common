import { createMigrationRegistry } from '@owlmeans/resource'
import type { MigrationRegistry } from '@owlmeans/resource'

import type { MongoTx } from './types.js'

export interface MongoDeclaration {
  migrations: MigrationRegistry<MongoTx>
}

/**
 * Per-alias migration store, held at module scope rather than on the resource object.
 *
 * `reinitializeContext` rebuilds every resource from the maker, which drops anything a
 * caller attached by chaining afterwards. For indexes that is survivable — they already
 * exist in the database and `updateIndexes` only ever adds. Migrations are not: a layer
 * switch points the resource at a *different* database, and a registry emptied by the
 * rebuild would mean the entity database silently never gets the transformation. Keying
 * by alias makes the declarations outlive any number of context switches.
 */
const declarations: Map<string, MongoDeclaration> = new Map()

export const getDeclaration = (alias: string): MongoDeclaration => {
  let declaration = declarations.get(alias)
  if (declaration == null) {
    declaration = { migrations: createMigrationRegistry<MongoTx>() }
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
