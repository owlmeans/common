import { pgErrorToResourceError, PostgresConnectionError, quoteIdent } from '@owlmeans/postgres-resource'
import type { PostgresMeta } from '@owlmeans/postgres-resource'
import type { Pool } from 'pg'

import { DEF_RETRIES, DEF_RETRY_DELAY, TERMINAL_CONNECT_CODES } from '../consts.js'

/**
 * Retryable means "the server isn't up yet". A driver level failure carries no `code` at
 * all (`ECONNREFUSED`, DNS) and is exactly the case worth waiting on; a Postgres error
 * code that names a credential or catalog problem will say the same thing in a minute.
 */
const isTransient = (error: unknown): boolean => {
  const code = (error as { code?: string } | null)?.code
  if (code == null) {
    return true
  }

  return !TERMINAL_CONNECT_CODES.includes(code)
}

/**
 * Wait for the server to answer a query, not merely to accept a socket.
 *
 * Postgres binds its port before it finishes recovery, so a sidecar or an operator managed
 * instance routinely accepts a connection and then refuses to run anything. Every OwlMeans
 * deployment grew its own copy of this loop; this is the one.
 *
 * @throws {PostgresConnectionError}
 */
export const probe = async (pool: Pool, meta: PostgresMeta, location: string): Promise<void> => {
  const retries = Math.max(1, meta.retries ?? DEF_RETRIES)
  const delay = meta.retryDelayMillis ?? DEF_RETRY_DELAY
  let last: unknown

  for (let attempt = 1; attempt <= retries; ++attempt) {
    try {
      await pool.query('SELECT 1')

      return
    } catch (error) {
      last = error
      if (attempt === retries || !isTransient(error)) {
        break
      }
      console.log(`${location}: not ready (${attempt}/${retries}), retrying in ${delay}ms…`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  const translated = pgErrorToResourceError(last)
  const failure = new PostgresConnectionError(`unreachable:${location}:${translated.message}`)
  failure.cause = last

  throw failure
}

/** `CREATE SCHEMA IF NOT EXISTS` on a pooled connection. */
export const ensureSchema = async (pool: Pool, schema: string): Promise<void> => {
  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`)
  } catch (error) {
    throw pgErrorToResourceError(error)
  }
}
