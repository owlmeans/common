import { PostgresConnectionError } from '@owlmeans/postgres-resource'
import type { PostgresMeta } from '@owlmeans/postgres-resource'
import type { DbConfig } from '@owlmeans/resource'
import type { PoolConfig } from 'pg'

import { DEF_POOL_SIZE, DEF_PORT } from '../consts.js'

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
export const parseUrl = (url: string): PoolConfig => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new PostgresConnectionError('malformed-url')
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new PostgresConnectionError(`unexpected-protocol:${parsed.protocol.replace(':', '')}`)
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  /** IPv6 literals arrive bracketed from `URL`; `pg` wants the bare address. */
  const host = decodeURIComponent(parsed.hostname).replace(/^\[|\]$/g, '')
  const mode = parsed.searchParams.get('sslmode')

  const config: PoolConfig = {
    host,
    port: parsed.port !== '' ? parseInt(parsed.port, 10) : DEF_PORT
  }
  if (parsed.username !== '') {
    config.user = decodeURIComponent(parsed.username)
  }
  if (parsed.password !== '') {
    config.password = decodeURIComponent(parsed.password)
  }
  if (database !== '') {
    config.database = database
  }
  if (mode != null && mode !== 'disable') {
    /**
     * `no-verify` is what a self signed in-cluster certificate needs, and is the only
     * mode that may skip verification — anything else keeps the chain checked.
     */
    config.ssl = mode === 'no-verify' ? { rejectUnauthorized: false } : true
  }

  return config
}

/**
 * Turn a {@link DbConfig} into a `pg` pool configuration.
 *
 * Values that start with `/` have already been read from disk by the `fileConfigReader`
 * middleware, so a file mounted secret and a literal one are indistinguishable here —
 * which is what lets a deployment move from env vars to mounted files without a code
 * change.
 */
export const prepareConfig = (config: DbConfig, overrides?: PoolConfig): PoolConfig => {
  const meta = (config.meta ?? {}) as PostgresMeta

  /**
   * `DbConfig.host` is an array for Mongo's replica sets. Postgres has no client side
   * equivalent — multi-host failover is the pooler's job — so only the first is used.
   */
  const host = Array.isArray(config.host) ? config.host[0] : config.host

  const base: PoolConfig = meta.url != null
    ? parseUrl(meta.url)
    : {
      host,
      port: config.port ?? DEF_PORT,
      ...(config.user != null ? { user: config.user } : {}),
      ...(config.secret != null ? { password: config.secret } : {}),
      /** Absent, libpq falls back to the connection user's name. */
      ...(meta.database != null ? { database: meta.database } : {})
    }

  const prepared: PoolConfig = {
    ...base,
    max: meta.max ?? DEF_POOL_SIZE,
    ...(meta.ssl != null ? { ssl: meta.ssl as PoolConfig['ssl'] } : {}),
    ...(meta.idleTimeoutMillis != null ? { idleTimeoutMillis: meta.idleTimeoutMillis } : {}),
    ...(meta.connectionTimeoutMillis != null
      ? { connectionTimeoutMillis: meta.connectionTimeoutMillis }
      : {}),
    /**
     * A server side cap, so a query that outlives its caller stops holding a connection
     * and its locks — the failure mode that turns one slow statement into a stuck pool.
     */
    ...(meta.statementTimeoutMillis != null
      ? { statement_timeout: meta.statementTimeoutMillis }
      : {}),
    ...overrides
  }

  return prepared
}

/** Effective database of an open pool, as `pg` resolved it. */
export const poolDatabase = (pool: { options?: PoolConfig }): string =>
  pool.options?.database ?? pool.options?.user ?? ''
