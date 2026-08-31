import { describe, expect, test } from 'bun:test'
import { MisshapedRecord, RecordExists, ResourceError } from '@owlmeans/resource'

import {
  describePgError, PgErrorCode, PostgresCastRequired, PostgresCheckError, PostgresConnectionError,
  PostgresConstraintError, PostgresDeadlockError, PostgresError, PostgresForeignKeyError,
  pgErrorToResourceError
} from '@owlmeans/postgres-resource'

interface DriverShape {
  code: string
  message?: string
  constraint?: string
  table?: string
  column?: string
  detail?: string
  hint?: string
  severity?: string
  where?: string
}

const driver = (shape: DriverShape): Error => Object.assign(new Error(shape.message ?? 'pg'), shape)

/** What Drizzle raises: its own class, with the driver error hung off `cause`. */
const wrapped = (shape: DriverShape): Error => {
  const failure = new Error(`Failed query: insert into "app"."users" ...`)
  failure.cause = driver(shape)
  failure.name = 'DrizzleQueryError'

  return failure
}

describe('@owlmeans/postgres-resource — driver error translation', () => {
  test('maps every code the resource layer promises a class for', () => {
    const cases: Array<[string, Function]> = [
      [PgErrorCode.UniqueViolation, RecordExists],
      [PgErrorCode.NotNullViolation, MisshapedRecord],
      [PgErrorCode.ForeignKeyViolation, PostgresForeignKeyError],
      [PgErrorCode.CheckViolation, PostgresCheckError],
      [PgErrorCode.DatatypeMismatch, PostgresCastRequired],
      [PgErrorCode.CannotCoerce, PostgresCastRequired],
      [PgErrorCode.DeadlockDetected, PostgresDeadlockError]
    ]

    for (const [code, expected] of cases) {
      expect(pgErrorToResourceError(driver({ code }))).toBeInstanceOf(expected as never)
    }

    /** Class prefixes, for the codes with no dedicated class. */
    expect(pgErrorToResourceError(driver({ code: '08006' }))).toBeInstanceOf(PostgresConnectionError)
    expect(pgErrorToResourceError(driver({ code: '23P01' }))).toBeInstanceOf(PostgresConstraintError)
    expect(pgErrorToResourceError(driver({ code: '42P01' }))).toBeInstanceOf(PostgresError)
  })

  /**
   * CRUD goes through Drizzle, so the driver error always arrives wrapped. Classifying on
   * the outer error collapses the whole vocabulary above into one opaque class on exactly
   * the paths callers use most.
   */
  test('classifies a driver error Drizzle has wrapped', () => {
    const failure = pgErrorToResourceError(wrapped({
      code: PgErrorCode.UniqueViolation, constraint: 'users_email_key'
    }))

    expect(failure).toBeInstanceOf(RecordExists)
    expect(failure.message).toContain(PgErrorCode.UniqueViolation)
    expect(failure.message).toContain('users_email_key')
    /** The wrapper is kept as the cause — unwrapping is for classification, not for loss. */
    expect((failure.cause as Error).name).toBe('DrizzleQueryError')
  })

  test('leads with the code and never echoes bound parameters', () => {
    const described = describePgError(wrapped({
      code: PgErrorCode.UniqueViolation,
      message: 'duplicate key value violates unique constraint "users_email_key"',
      constraint: 'users_email_key',
      table: 'users',
      column: 'email',
      detail: 'Key (email)=(a@b.c) already exists.',
      hint: 'try another',
      severity: 'ERROR',
      where: `SQL statement "INSERT INTO users VALUES ('secret')"`
    }))

    /** The fixer classifies on this text, so the code has to be the first thing in it. */
    expect(described.startsWith(PgErrorCode.UniqueViolation)).toBe(true)
    expect(described).toContain('table=users')
    expect(described).toContain('column=email')
    expect(described).toContain('hint=try another')
    /** `where` can quote the statement, and the statement can quote a value. */
    expect(described).not.toContain('SQL statement')
  })

  test('passes a framework error through untouched', () => {
    const original = new ResourceError('already-translated')

    expect(pgErrorToResourceError(original)).toBe(original)
  })

  test('leaves an error that is not from the driver alone', () => {
    const plain = new Error('not postgres at all')

    expect(pgErrorToResourceError(plain)).toBe(plain)
    expect(describePgError(plain)).toBe('not postgres at all')
    expect(pgErrorToResourceError('a string')).toBeInstanceOf(PostgresError)
  })

  test('survives a circular cause chain', () => {
    const outer = new Error('outer') as Error & { cause?: unknown }
    const inner = new Error('inner') as Error & { cause?: unknown }
    outer.cause = inner
    inner.cause = outer

    /**
     * Returning at all is the assertion — an unbounded walk would spin forever. Note that
     * `expect(fn).not.toThrow()` cannot say this in Bun: it reports a *returned* `Error` as
     * a thrown one, and every one of these translations returns exactly that.
     */
    expect(pgErrorToResourceError(outer)).toBe(outer)
  })
})
