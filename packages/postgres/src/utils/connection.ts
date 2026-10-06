import { pgErrorHelper, pgNameHelper, PostgresConnectionError } from '@owlmeans/postgres-resource'
import type { PostgresMeta } from '@owlmeans/postgres-resource'
import { logger } from '@owlmeans/log'
import type { Pool } from 'pg'

import { DEF_RETRIES, DEF_RETRY_DELAY, TERMINAL_CONNECT_CODES } from '../consts.js'
import type { PgConnectionHelper } from './connection/types.js'

const log = logger('postgres')

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

export const makePgConnectionHelper = (pool: Pool): PgConnectionHelper => {
  const { pgErrorToResourceError } = pgErrorHelper

  const probe = async (meta: PostgresMeta, location: string): Promise<void> => {
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
        log.debug('Postgres not ready, retrying', { location, attempt, retries, delay })
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    const translated = pgErrorToResourceError(last)
    const failure = new PostgresConnectionError(`unreachable:${location}:${translated.message}`)
    failure.cause = last

    throw failure
  }

  const ensureSchema = async (schema: string): Promise<void> => {
    try {
      await pool.query(`CREATE SCHEMA IF NOT EXISTS ${pgNameHelper.quoteIdent(schema)}`)
    } catch (error) {
      throw pgErrorToResourceError(error)
    }
  }

  return { probe, ensureSchema }
}
