import { describe, expect, test } from 'bun:test'
import { extractAuthToken } from '@owlmeans/auth-common/utils'
import { AUTH_HEADER, AuthroizationType } from '@owlmeans/auth'
import type { AbstractRequest } from '@owlmeans/entrypoint'

const reqWith = (header: string | undefined): Partial<AbstractRequest> => ({
  headers: header == null ? {} : { [AUTH_HEADER]: header },
})

describe('@owlmeans/auth-common — extractAuthToken', () => {
  // The basic-ed25519 guard at packages/auth-common/src/guards/basic-ed25519/service.ts:64
  // calls extractAuthToken(req, AuthroizationType.Ed25519BasicSignature) inside `match`.
  // viable/sources/publisher/src/helpers/ws-auth.ts also reads AUTH_HEADER directly.
  test('returns the value when the header prefix matches the expected type', () => {
    const req = reqWith(`${AuthroizationType.Ed25519BasicToken.toUpperCase()} abc.def`)
    expect(extractAuthToken(req, AuthroizationType.Ed25519BasicToken)).toBe('abc.def')
  })

  test('returns null when the header prefix does not match', () => {
    const req = reqWith(`${AuthroizationType.Ed25519BasicSignature.toUpperCase()} abc.def`)
    expect(extractAuthToken(req, AuthroizationType.Ed25519BasicToken)).toBeNull()
  })

  test('returns null when the Authorization header is absent', () => {
    expect(extractAuthToken(reqWith(undefined), AuthroizationType.Ed25519BasicToken)).toBeNull()
  })

  test('with type=null returns the raw value irrespective of prefix', () => {
    const req = reqWith('CUSTOM-PREFIX raw-value')
    expect(extractAuthToken(req, null)).toBe('raw-value')
  })
})
