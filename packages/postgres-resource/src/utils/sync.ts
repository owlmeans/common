import { logger } from '@owlmeans/log'
import type { PoolClient } from 'pg'

import { PostgresCastRequired, PostgresSyncError } from '../errors.js'
import { pgErrorHelper } from '../pg-error.js'
import type { DdlPlan, TableSpec } from '../types.js'
import { makePgIntrospectHelper } from './introspect.js'
import { pgNameHelper } from './name.js'
import { CAST_DATA_CODES } from './consts.local.js'
import type { PgSyncHelper } from './sync/types.js'

const log = logger('postgres-resource')

export const makePgSyncHelper = (client: PoolClient): PgSyncHelper => {
  const { describePgError, pgErrorToResourceError } = pgErrorHelper
  const { advisoryKey, quoteIdent } = pgNameHelper
  const introspect = makePgIntrospectHelper(client)

  const acquireLock = async (qualified: string): Promise<void> => {
    const [first, second] = advisoryKey(qualified)
    await client.query('SELECT pg_advisory_lock($1, $2)', [first, second])
  }

  const releaseLock = async (qualified: string): Promise<void> => {
    const [first, second] = advisoryKey(qualified)
    try {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [first, second])
    } catch {
      /** Releasing the session drops the lock anyway — never mask the original failure. */
    }
  }

  const ensureSchema = async (schema: string): Promise<void> => {
    try {
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`)
    } catch (error) {
      throw pgErrorToResourceError(error)
    }
  }

  const applyPlan = async (spec: TableSpec, plan: DdlPlan): Promise<DdlPlan> => {
    if (plan.statements.length < 1) {
      return plan
    }

    /** Read what a drop would cost before the transaction opens, so the log can say it. */
    for (const statement of plan.statements) {
      if (statement.destructive === true) {
        statement.affected = await introspect.countNonNull(spec.qualified, statement.target)
      }
    }

    await client.query('BEGIN')
    let current = ''
    try {
      for (const statement of plan.statements) {
        current = statement.sql
        if (statement.destructive === true && (statement.affected ?? 0) > 0) {
          log.warn('Dropping a column that holds values; declare it under pg.unmanaged or set pg.managed false to keep it', {
            table: spec.qualified, column: statement.target, rows: statement.affected,
          }, { event: 'migration.drop' })
        }
        await client.query(statement.sql)
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      const translated = pgErrorToResourceError(error)
      const code = (error as { code?: string } | null)?.code
      if (translated instanceof PostgresCastRequired || (code != null && CAST_DATA_CODES.includes(code))) {
        const failure = new PostgresCastRequired(
          `${spec.qualified}: ${describePgError(error)} — statement: ${current}.`
          + ' Declare `pg: { using: \'<expr>\' }` on the property, or perform the change in a'
          + ' `pre` migration so reconciliation observes no drift.'
        )
        failure.cause = error
        throw failure
      }
      const failure = new PostgresSyncError(`${spec.qualified}: ${describePgError(error)} — statement: ${current}`)
      failure.cause = error
      throw failure
    }

    return plan
  }

  return { acquireLock, releaseLock, ensureSchema, applyPlan }
}
