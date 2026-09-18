import { createMigrationRegistry } from '@owlmeans/resource'
import type { MigrationRegistry } from '@owlmeans/resource'
import type { AnySchema } from 'ajv'

import type { PgIndexSpec, PostgresTx } from './types.js'

export interface PostgresDeclaration {
  schema?: AnySchema
  indexes: PgIndexSpec[]
  migrations: MigrationRegistry<PostgresTx>
}

/**
 * Per-alias declaration store, held at module scope rather than on the resource object.
 *
 * A maker may run more than once for the same alias — a custom maker wrapping the built-in
 * one, a maker called again by an app or a spec. Keying the declarations by alias makes that
 * a no-op: every run reads and extends the same schema, indexes and migrations, so nothing a
 * caller chained onto an earlier resource object is lost. Losing a migration is silent — the
 * data transformation simply never runs — which is why the store cannot live on the object.
 */
const declarations: Map<string, PostgresDeclaration> = new Map()

export const getDeclaration = (alias: string): PostgresDeclaration => {
  let declaration = declarations.get(alias)
  if (declaration == null) {
    declaration = { indexes: [], migrations: createMigrationRegistry<PostgresTx>() }
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
