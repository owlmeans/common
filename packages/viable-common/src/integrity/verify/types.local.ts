import type { AppDescriptor } from '../../topology/apps/types.js'
import type { TargetPackage } from '../consts.js'

/**
 * A topology record that splits the tree into apps, as the manifest reads it.
 *
 * `apps` is the STRUCTURALLY narrowed list — the rules between entries are checked by the verifier
 * itself and refuse the tree (`app-map`) rather than quietly falling back to `main` the way a
 * runtime reader does.
 */
export interface AppsRecord {
  /** How many entries the record's `apps` list held, narrowable or not. */
  claimed: number
  apps: AppDescriptor[]
  /** The package directory names the record's `packages` list names. */
  packages: Set<string>
  dir: string
}

/** One extra app package the manifest checks, with the main package whose rules it inherits. */
export interface AppPackage {
  dir: string
  rules: TargetPackage.Web | TargetPackage.Api
  app: string
}
