import { describe, expect, test } from 'bun:test'
import {
  AuthError,
  AuthForbidden,
  AuthorizationError,
  AuthenFailed,
  AuthenPayloadError,
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
