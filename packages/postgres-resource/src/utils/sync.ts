import type { PoolClient } from 'pg'

import { PgErrorCode } from '../consts.js'
import { PostgresCastRequired, PostgresSyncError, describePgError, pgErrorToResourceError } from '../errors.js'
import type { DdlPlan, TableSpec } from '../types.js'
import { countNonNull } from './introspect.js'
import { advisoryKey, quoteIdent } from './name.js'

/**
 * Codes that mean "the cast is legal, the data isn't": a `text` column holding `'a'` retyped to
 * `integer`, a value too wide for the new length, a number past the new range. Postgres refuses
 * each of these rather than truncating, and the remedy is the same one a refused cast needs — so
 * they are only read as a cast problem here, inside DDL. On the CRUD path the identical code means
 * a caller passed a bad value, which is a different bug with a different fix.
 */
const CAST_DATA_CODES: string[] = [
  PgErrorCode.InvalidTextRepresentation,
  PgErrorCode.StringDataRightTruncation,
  PgErrorCode.NumericValueOutOfRange
]

/**
 * Serialize initialization across replicas. A session level lock, not `xact`, because
 * migrations run in their own transactions inside the critical section.
 */
export const acquireLock = async (client: PoolClient, qualified: string): Promise<void> => {
  const [first, second] = advisoryKey(qualified)
  await client.query('SELECT pg_advisory_lock($1, $2)', [first, second])
}

export const releaseLock = async (client: PoolClient, qualified: string): Promise<void> => {
  const [first, second] = advisoryKey(qualified)
  try {
    await client.query('SELECT pg_advisory_unlock($1, $2)', [first, second])
  } catch {
    /** Releasing the session drops the lock anyway — never mask the original failure. */
  }
}

export const ensureSchema = async (client: PoolClient, schema: string): Promise<void> => {
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`)
  } catch (error) {
    throw pgErrorToResourceError(error)
  }
}

/**
 * Apply a reconciliation plan in a single transaction.
 *
 * Postgres DDL is transactional, so a plan that fails partway leaves the table exactly as
 * it was. That property is what makes converging without confirmation prompts tolerable —
 * the table is either fully converged or untouched, never half migrated.
 *
 * @throws {PostgresCastRequired} Postgres refused an automatic cast.
 * @throws {PostgresSyncError} any other statement failed — the message names the statement.
 */
export const applyPlan = async (
  client: PoolClient, spec: TableSpec, plan: DdlPlan
): Promise<DdlPlan> => {
  if (plan.statements.length < 1) {
    return plan
  }

  /** Read what a drop would cost before the transaction opens, so the log can say it. */
  for (const statement of plan.statements) {
    if (statement.destructive === true) {
      statement.affected = await countNonNull(client, spec.qualified, statement.target)
    }
  }

  await client.query('BEGIN')
  let current = ''
  try {
    for (const statement of plan.statements) {
      current = statement.sql
      if (statement.destructive === true && (statement.affected ?? 0) > 0) {
        console.warn(
          `@owlmeans/postgres-resource: dropping ${spec.qualified}.${statement.target} —`
          + ` ${statement.affected} row(s) hold a value. Declare it under \`pg.unmanaged\``
          + ' or set `pg: { managed: false }` to keep it.'
        )
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
