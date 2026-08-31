import { ResilientError } from '@owlmeans/error'
import {
  MisshapedRecord, RecordExists, ResourceError
} from '@owlmeans/resource'

import { PgErrorCode } from './consts.js'

export class PostgresError extends ResourceError {
  public static override typeName = `${ResourceError.typeName}PostgresError`

  constructor(message: string = 'error') {
    super(`postgres:${message}`)
    this.type = PostgresError.typeName
  }
}

/** Structure reconciliation failed. The message carries the offending statement. */
export class PostgresSyncError extends PostgresError {
  public static override typeName = `${PostgresError.typeName}SyncError`

  constructor(message: string) {
    super(`sync:${message}`)
    this.type = PostgresSyncError.typeName
  }
}

/**
 * Postgres refused to cast a column to its new type. Fix it with `pg: { using: '<expr>' }`
 * on the property, or with a `pre` migration that performs the ALTER by hand — after
 * which reconciliation sees no drift and emits nothing.
 */
export class PostgresCastRequired extends PostgresSyncError {
  public static override typeName = `${PostgresSyncError.typeName}CastRequired`

  constructor(message: string) {
    super(`cast-required:${message}`)
    this.type = PostgresCastRequired.typeName
  }
}

export class PostgresConstraintError extends PostgresError {
  public static override typeName = `${PostgresError.typeName}ConstraintError`

  constructor(message: string) {
    super(`constraint:${message}`)
    this.type = PostgresConstraintError.typeName
  }
}

export class PostgresForeignKeyError extends PostgresConstraintError {
  public static override typeName = `${PostgresConstraintError.typeName}ForeignKey`

  constructor(message: string) {
    super(`foreign-key:${message}`)
    this.type = PostgresForeignKeyError.typeName
  }
}

export class PostgresCheckError extends PostgresConstraintError {
  public static override typeName = `${PostgresConstraintError.typeName}Check`

  constructor(message: string) {
    super(`check:${message}`)
    this.type = PostgresCheckError.typeName
  }
}

/** Serialization failure or deadlock — the caller may retry the whole transaction. */
export class PostgresDeadlockError extends PostgresError {
  public static override typeName = `${PostgresError.typeName}DeadlockError`

  public readonly retryable: boolean = true

  constructor(message: string) {
    super(`deadlock:${message}`)
    this.type = PostgresDeadlockError.typeName
  }
}

/** A `{{alias}}` placeholder in custom SQL couldn't be resolved. */
export class PostgresPlaceholderError extends PostgresError {
  public static override typeName = `${PostgresError.typeName}PlaceholderError`

  constructor(message: string) {
    super(`placeholder:${message}`)
    this.type = PostgresPlaceholderError.typeName
  }
}

export class PostgresConnectionError extends PostgresError {
  public static override typeName = `${PostgresError.typeName}ConnectionError`

  constructor(message: string) {
    super(`connection:${message}`)
    this.type = PostgresConnectionError.typeName
  }
}

/** The least-privilege admin path failed. */
export class PostgresBootstrapError extends PostgresError {
  public static override typeName = `${PostgresError.typeName}BootstrapError`

  constructor(message: string) {
    super(`bootstrap:${message}`)
    this.type = PostgresBootstrapError.typeName
  }
}

interface PgDriverError {
  code?: string
  detail?: string
  hint?: string
  severity?: string
  constraint?: string
  table?: string
  column?: string
  message?: string
}

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

/**
 * The framework's error marshalling preserves only type, message and stack, so the
 * Postgres diagnostics have to travel inside the message. Downstream tooling — notably
 * the viable-agent fixer, which retries on `42P01` / `42703` — classifies on exactly
 * this text, so the code always leads.
 *
 * `where` is deliberately never included: it can echo bound parameter values.
 *
 * Exported so a wrapper can quote the diagnostics without also quoting the translated error's
 * own type prefix, which would nest one error vocabulary inside another's message.
 */
export const describePgError = (error: unknown): string => {
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

/**
 * Translate a raw `pg` driver error into the framework's error vocabulary, so a driver
 * type never escapes the package. Errors that already are `ResilientError`s pass through
 * untouched — the reconciler and the migration runner raise their own.
 */
export const pgErrorToResourceError = (error: unknown): Error => {
  if (error instanceof ResilientError) {
    return error
  }
  const driver = unwrap(error)
  if (!isDriverError(driver)) {
    return error instanceof Error ? error : new PostgresError(`${error}`)
  }

  const message = describe(driver)
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

ResilientError.registerErrorClass(PostgresError)
ResilientError.registerErrorClass(PostgresSyncError)
ResilientError.registerErrorClass(PostgresCastRequired)
ResilientError.registerErrorClass(PostgresConstraintError)
ResilientError.registerErrorClass(PostgresForeignKeyError)
ResilientError.registerErrorClass(PostgresCheckError)
ResilientError.registerErrorClass(PostgresDeadlockError)
ResilientError.registerErrorClass(PostgresPlaceholderError)
ResilientError.registerErrorClass(PostgresConnectionError)
ResilientError.registerErrorClass(PostgresBootstrapError)
