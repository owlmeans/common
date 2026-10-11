import { createMigrationRegistry } from '@owlmeans/resource'

import type { PgDeclarationHelper } from './declarations/types.js'
import type { PostgresTx, PostgresDeclaration } from './types.js'

/**
 * Per-alias declaration store, held at module scope rather than on the resource object.
 *
 * A maker may run more than once for the same alias — a custom maker wrapping the built-in
 * one, a maker called again by an app or a spec. Keying the declarations by alias makes that
 * a no-op: every run reads and extends the same schema, indexes and migrations, so nothing a
 * caller chained onto an earlier resource object is lost. Losing a migration is silent — the
 * data transformation simply never runs — which is why the store cannot live on the object.
 *
 * Process-wide for the same reason: it stays outside the factory, so every helper built from it
 * reads the one store.
 */
const declarations: Map<string, PostgresDeclaration> = new Map()

export const createPgDeclarationHelper = (): PgDeclarationHelper => {
  const getDeclaration = (alias: string): PostgresDeclaration => {
    let declaration = declarations.get(alias)
    if (declaration == null) {
      declaration = { indexes: [], migrations: createMigrationRegistry<PostgresTx>() }
      declarations.set(alias, declaration)
    }

    return declaration
  }

  const resetDeclarations = (alias?: string): void => {
    if (alias == null) {
      declarations.clear()
      return
    }
    declarations.delete(alias)
  }

  return { getDeclaration, resetDeclarations }
}

export const pgDeclarationHelper = createPgDeclarationHelper()

/** @deprecated compat:factory-refactor — use `pgDeclarationHelper.getDeclaration(…)` */
export const getDeclaration = (alias: string): PostgresDeclaration => pgDeclarationHelper.getDeclaration(alias)

/** @deprecated compat:factory-refactor — use `pgDeclarationHelper.resetDeclarations(…)` */
export const resetDeclarations = (alias?: string): void => pgDeclarationHelper.resetDeclarations(alias)
