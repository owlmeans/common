import { describe, expect, test } from 'bun:test'
import {
  AuthError,
  AuthForbidden,
  AuthorizationError,
  AuthenFailed,
  AuthenPayloadError,
  AuthUnknown,
} from '@owlmeans/auth'

describe('@owlmeans/auth — error inheritance chain', () => {
  // Matches viable-agent/packages/template/packages/backend/src/utils/auth-guard.ts
  // which throws `new AuthForbidden('token')` and relies on broad `AuthError` catches
  // upstream in the request lifecycle.
  test('AuthForbidden is a kind of AuthorizationError, AuthError, and Error', () => {
    const err = new AuthForbidden('token')
    expect(err).toBeInstanceOf(AuthForbidden)
    expect(err).toBeInstanceOf(AuthorizationError)
    expect(err).toBeInstanceOf(AuthError)
    expect(err).toBeInstanceOf(Error)
  })

  test('AuthenPayloadError is a kind of AuthenFailed and AuthError', () => {
    const err = new AuthenPayloadError('schema-mismatch')
    expect(err).toBeInstanceOf(AuthenPayloadError)
    expect(err).toBeInstanceOf(AuthenFailed)
    expect(err).toBeInstanceOf(AuthError)
  })

  test('subclass instances expose the leaf typeName via `type`', () => {
    const forbidden = new AuthForbidden('token')
    const failed = new AuthenFailed('signature')
    expect(forbidden.type).toBe(AuthForbidden.typeName)
    expect(failed.type).toBe(AuthenFailed.typeName)
    expect(forbidden.type).not.toBe(failed.type)
  })

  test('a try/catch on AuthError catches every auth-package subclass', () => {
    const thrown: AuthError[] = []
    for (const make of [
      () => new AuthForbidden('a'),
      () => new AuthenFailed('b'),
      () => new AuthenPayloadError('c'),
    ]) {
      try { throw make() } catch (e) {
        if (!(e instanceof AuthError)) throw e
        thrown.push(e)
      }
    }
    expect(thrown).toHaveLength(3)
  })
})

describe('@owlmeans/auth — declared HTTP statuses', () => {
  // An unknown method, provider or identity is the caller's request — never a crashed server (500).
  test('AuthUnknown declares 400 and stays outside the authorization family', () => {
    const err = new AuthUnknown('email-otp')
    expect(AuthUnknown.httpStatus).toBe(400)
    expect((err.constructor as { httpStatus?: unknown }).httpStatus).toBe(400)
    expect(err).toBeInstanceOf(AuthError)
    expect(err).not.toBeInstanceOf(AuthorizationError)
  })

  // Their 401/403 comes from the family mapping in `@owlmeans/server-api`, never from a declaration.
  test('the authorization family declares no status of its own', () => {
    for (const refusal of [AuthorizationError, AuthForbidden]) {
      expect([refusal.typeName, (refusal as { httpStatus?: unknown }).httpStatus]).toEqual([refusal.typeName, undefined])
    }
  })
})
