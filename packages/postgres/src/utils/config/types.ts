import type { DbConfig } from '@owlmeans/resource'
import type { PoolConfig } from 'pg'

/** A db config entry as the `pg` pool configuration it describes. */
export interface PgConfigHelper {
  /**
   * Split a `postgres://` URL into pool fields.
   *
   * node-postgres accepts a `connectionString` directly, but the parsed values *override*
   * every sibling field — so `{ connectionString, database }` silently ignores the
   * database. Parsing here instead keeps overriding possible, which the admin path needs
   * to reach both the maintenance database and the target one over the same credentials.
   *
   * @throws {PostgresConnectionError}
   */
  parseUrl: (url: string) => PoolConfig
  /**
   * Turn a {@link DbConfig} into a `pg` pool configuration.
   *
   * Values that start with `/` have already been read from disk by the `fileConfigReader`
   * middleware, so a file mounted secret and a literal one are indistinguishable here —
   * which is what lets a deployment move from env vars to mounted files without a code
   * change.
   */
  prepareConfig: (config: DbConfig, overrides?: PoolConfig) => PoolConfig
  /** Effective database of an open pool, as `pg` resolved it. */
  poolDatabase: (pool: { options?: PoolConfig }) => string
}
