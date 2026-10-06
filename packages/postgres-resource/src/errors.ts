import { ResilientError } from '@owlmeans/error'
import { ResourceError } from '@owlmeans/resource'

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
