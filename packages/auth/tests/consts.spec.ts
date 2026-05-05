import { describe, expect, test } from 'bun:test'
import {
  AUTH_HEADER,
  AuthRole,
  AuthenticationType,
  AuthroizationType,
} from '@owlmeans/auth'

describe('@owlmeans/auth — protocol constants', () => {
  // Both viable and viable-agent rely on these string values being stable —
  // they end up in HTTP headers (`Authorization: ED25519-BASIC-TOKEN ...`)
  // and trusted-record `role` fields (e.g. AuthRole.Service).
  test('AUTH_HEADER is the lowercase HTTP header name', () => {
    expect(AUTH_HEADER).toBe('authorization')
  })

  test('AuthRole exposes the canonical roles consumers reference', () => {
    expect(AuthRole.User).toBe('user')
    expect(AuthRole.Service).toBe('service')
    expect(AuthRole.Superuser).toBe('superuser')
    expect(AuthRole.Guest).toBe('guest')
  })

  test('AuthroizationType.Ed25519BasicToken matches the bearer prefix used by basic-ed25519 guard', () => {
    expect(AuthroizationType.Ed25519BasicToken).toBe('ed25519-basic-token')
    expect(AuthroizationType.Ed25519BasicSignature).toBe('ed25519-basic-signature')
    // The header value from auth-common's basic-ed25519 guard upper-cases this prefix.
    expect(AuthroizationType.Ed25519BasicToken.toUpperCase()).toBe('ED25519-BASIC-TOKEN')
  })

  test('AuthenticationType covers the protocol paths viable consumers use', () => {
    expect(AuthenticationType.BasicEd25519).toBe('basic-ed25519')
    expect(AuthenticationType.OneTimeToken).toBe('one-time-token')
  })
})
