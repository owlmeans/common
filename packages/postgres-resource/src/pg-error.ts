import { ResilientError } from '@owlmeans/error'
import { MisshapedRecord, RecordExists } from '@owlmeans/resource'

import { PgErrorCode } from './consts.js'
import {
  PostgresCastRequired, PostgresCheckError, PostgresConnectionError, PostgresConstraintError,
  PostgresDeadlockError, PostgresError, PostgresForeignKeyError
} from './errors.js'
import type { PgErrorHelper } from './pg-error/types.js'
import type { PgDriverError } from './types.local.js'

export const createPgErrorHelper = (): PgErrorHelper => {
  const isDriverError = (error: unknown): error is PgDriverError =>
    error != null && typeof error === 'object' && 'code' in error

  /**
   * Reach the `pg` error inside whatever wrapped it.
   *
   * Drizzle raises `DrizzleQueryError` and hangs the driver error off `cause`, so a unique
   * violation arriving through the query builder carries no `code` at the top level. Reading
   * only the outer error is what makes the whole vocabulary below collapse to one opaque
   * class on every CRUD path — and it is exactly the paths that go through Drizzle.
   *
   * The walk is bounded because `cause` chains can be circular.
   */
  const unwrap = (error: unknown): unknown => {
    let current = error
    for (let depth = 0; depth < 8; depth += 1) {
      if (isDriverError(current)) {
        return current
      }
      const cause = (current as { cause?: unknown } | null)?.cause
      if (cause == null || cause === current) {
        return error
      }
      current = cause
    }

    return error
  }

  const describePgError = (error: unknown): string => {
    const driver = unwrap(error)
    if (!isDriverError(driver)) {
      return error instanceof Error ? error.message : `${error}`
    }

    return describe(driver)
  }

  const describe = (error: PgDriverError): string => {
    const parts = [error.code ?? 'unknown']
    if (error.message != null) parts.push(error.message)
    if (error.constraint != null) parts.push(`constraint=${error.constraint}`)
    if (error.table != null) parts.push(`table=${error.table}`)
    if (error.column != null) parts.push(`column=${error.column}`)
    if (error.detail != null) parts.push(`detail=${error.detail}`)
    if (error.hint != null) parts.push(`hint=${error.hint}`)
    if (error.severity != null) parts.push(`severity=${error.severity}`)

    return parts.join(' ')
  }

  const pgErrorToResourceError = (error: unknown, query?: string): Error => {
    if (error instanceof ResilientError) {
      return error
    }
    const driver = unwrap(error)
    if (!isDriverError(driver)) {
      return error instanceof Error ? error : new PostgresError(`${error}`)
    }

    const message = describe(driver) + (query == null ? '' : `\nSQL: ${query}`)
    const produce = (): Error => {
      switch (driver.code) {
        case PgErrorCode.UniqueViolation:
          return new RecordExists(message)
        case PgErrorCode.NotNullViolation:
          return new MisshapedRecord(message)
        case PgErrorCode.ForeignKeyViolation:
          return new PostgresForeignKeyError(message)
        case PgErrorCode.CheckViolation:
          return new PostgresCheckError(message)
        case PgErrorCode.DatatypeMismatch:
        case PgErrorCode.CannotCoerce:
          return new PostgresCastRequired(message)
        case PgErrorCode.SerializationFailure:
        case PgErrorCode.DeadlockDetected:
          return new PostgresDeadlockError(message)
        default:
          break
      }
      if (driver.code != null && driver.code.startsWith('08')) {
        return new PostgresConnectionError(message)
      }
      if (driver.code != null && driver.code.startsWith('23')) {
        return new PostgresConstraintError(message)
      }

      return new PostgresError(message)
    }

    const produced = produce()
    /** The *original* error, wrapper and all — unwrapping is for classification, not for loss. */
    produced.cause = error

    return produced
  }

  return { describePgError, pgErrorToResourceError }
}

export const pgErrorHelper = createPgErrorHelper()

