import type { TableSpec } from '../../types.js'

/**
 * `{{alias}}` placeholders of custom SQL, resolved through ONE context's registered postgres
 * resources. Reached as `pgPlaceholdersOf(context)`.
 */
export interface PgPlaceholderHelper {
  /**
   * Fully qualified table of a registered postgres resource; omit the alias for `self`.
   * This is what `PostgresTx.ref` and `PostgresResource.ref` resolve through.
   *
   * @throws {PostgresPlaceholderError}
   */
  refOf: (self: TableSpec | null, alias?: string) => string
  /**
   * Rewrite `{{...}}` placeholders into quoted identifiers.
   *
   * Identifiers only — `$1`-style parameters are left exactly as written and their values
   * never pass through here. Postgres can't bind an identifier as a parameter, which is the
   * whole reason this mechanism has to exist; values have no such excuse.
   *
   * @throws {PostgresPlaceholderError}
   */
  resolvePlaceholders: (text: string, self: TableSpec | null) => string
}
