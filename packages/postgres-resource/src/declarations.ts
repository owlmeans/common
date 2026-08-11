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
 * `reinitializeContext` rebuilds every resource, which drops anything a caller attached
 * by chaining. Mongo lives with that by requiring the app to pass `makeCustomResource`
 * and re-run the whole maker; migrations can't depend on that discipline, because losing
 * one silently means a data transformation never runs. Keying the declarations by alias
 * makes them survive any number of context switches.
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
