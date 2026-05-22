import { describe, test, expect } from 'bun:test'
import { makeTestContext } from './context.js'
import { makeFixtureKeyPair } from '@owlmeans/test-auth'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { AuthorizationError, AuthroizationType, AuthRole } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import { DEFAULT_ALIAS, AUTH_RESOURCE, USER_ID } from '../src/consts.js'
import type { AuthService } from '@owlmeans/auth-common'
import type { Resource } from '@owlmeans/resource'
import type { ClientAuthRecord } from '../src/types.js'

/**
 * Produce a valid bearer token (as server-auth would issue)
 */
const makeBearer = async (auth: Partial<Auth>) => {
  const appKP = makeFixtureKeyPair('client-auth-app-key')
  const fullAuth: Auth = {
    token: 'nonce-123',
    userId: 'user-1',
    scopes: ['*'],
    role: AuthRole.User,
    type: AuthroizationType.Ed25519BasicToken,
    source: 'test-service',
    isUser: true,
    createdAt: new Date(),
    ...auth,
  }

  const signed = await makeEnvelopeModel<Auth>(AuthroizationType.Ed25519BasicToken)
    .send(fullAuth, null).sign(appKP, EnvelopeKind.Token)

  return `${AuthroizationType.Ed25519BasicToken.toUpperCase()} ${signed}`
}

const initContext = async () => {
  const context = makeTestContext()
  context.configure()
  await context.init()
  return context
}

describe('@owlmeans/client-auth — update', () => {
  test('stores token and parses Auth from bearer', async () => {
    const context = await initContext()
    const authService = context.service<AuthService>(DEFAULT_ALIAS)

    const bearer = await makeBearer({ userId: 'user-update-test', scopes: ['read'] })
    await authService.update(bearer)

    // Token should be stored in memory
    expect(authService.token).toBe(bearer)

    // Auth should be parsed from the envelope
    expect(authService.auth).not.toBeUndefined()
    expect(authService.auth!.userId).toBe('user-update-test')
    expect(authService.auth!.scopes).toEqual(['read'])

    // Token should be persisted in the resource store
    const store = context.resource<Resource<ClientAuthRecord>>(AUTH_RESOURCE)
    const record = await store.load(USER_ID)
    expect(record).not.toBeNull()
    expect(record!.token).toBe(bearer)
  })

  test('clears auth when token is null', async () => {
    const context = await initContext()
    const authService = context.service<AuthService>(DEFAULT_ALIAS)

    // First set a valid token
    const bearer = await makeBearer({ userId: 'user-to-clear' })
    await authService.update(bearer)
    expect(authService.auth).not.toBeUndefined()

    // Now clear it
    await authService.update(null as any)

    expect(authService.token).toBeNull()
    expect(authService.auth).toBeUndefined()
  })
})

describe('@owlmeans/client-auth — authenticated', () => {
  test('returns null when no token exists', async () => {
    const context = await initContext()
    const authService = context.service<AuthService>(DEFAULT_ALIAS)

    const result = await authService.authenticated()
    expect(result).toBeNull()
  })

  test('loads token from storage on first call', async () => {
    const context = await initContext()
    const authService = context.service<AuthService>(DEFAULT_ALIAS)

    // Pre-populate storage directly (simulating previous session)
    const bearer = await makeBearer({ userId: 'persisted-user' })
    const store = context.resource<Resource<ClientAuthRecord>>(AUTH_RESOURCE)
    await store.create({ id: USER_ID, token: bearer })

    // Now call authenticated — it should load from store
    const result = await authService.authenticated()
    expect(result).toBe(bearer)
    expect(authService.auth).not.toBeUndefined()
    expect(authService.auth!.userId).toBe('persisted-user')
  })

  test('returns in-memory token without re-reading storage', async () => {
    const context = await initContext()
    const authService = context.service<AuthService>(DEFAULT_ALIAS)

    const bearer = await makeBearer({ userId: 'memory-user' })
    await authService.update(bearer)

    const result = await authService.authenticated()
    expect(result).toBe(bearer)
  })
})

describe('@owlmeans/client-auth — user', () => {
  test('throws AuthorizationError when not authenticated', async () => {
    const context = await initContext()
    const authService = context.service<AuthService>(DEFAULT_ALIAS)

    expect(() => authService.user()).toThrow(AuthorizationError)
  })

  test('returns Auth after update', async () => {
    const context = await initContext()
    const authService = context.service<AuthService>(DEFAULT_ALIAS)

    const bearer = await makeBearer({ userId: 'user-for-user-call', role: AuthRole.Guest })
    await authService.update(bearer)

    const auth = authService.user()
    expect(auth.userId).toBe('user-for-user-call')
    expect(auth.role).toBe(AuthRole.Guest)
  })
})
