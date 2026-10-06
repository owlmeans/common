import type { PostgresMeta } from '@owlmeans/postgres-resource'

/** Readiness and namespace setup over one pool. */
export interface PgConnectionHelper {
  /**
   * Wait for the server to answer a query, not merely to accept a socket.
   *
   * Postgres binds its port before it finishes recovery, so a sidecar or an operator managed
   * instance routinely accepts a connection and then refuses to run anything. Every OwlMeans
   * deployment grew its own copy of this loop; this is the one.
   *
   * @throws {PostgresConnectionError}
   */
  probe: (meta: PostgresMeta, location: string) => Promise<void>
  /** `CREATE SCHEMA IF NOT EXISTS` on a pooled connection. */
  ensureSchema: (schema: string) => Promise<void>
}
