import { describe, test, expect } from 'bun:test'
import { makeTestContext } from './context.js'
import { makeFixtureKeyPair } from '@owlmeans/test-auth'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { AuthenFailed, AuthroizationType, AuthRole } from '@owlmeans/auth'
import type { AuthCredentials, Auth } from '@owlmeans/auth'
import { DEFAULT_ALIAS } from '../src/consts.js'
import type { AuthService } from '../src/types.js'

const initContext = async () => {
  const { context, authServiceKP, appKP, authServiceRecord } = makeTestContext()
  context.configure()
  await context.init()
  return { context, authServiceKP, appKP, authServiceRecord }
}

describe('@owlmeans/server-auth — authenticate (mode 2: external auth service credentials)', () => {
  test('exchanges valid signed intermediate credentials into a bearer token', async () => {
    const { context, authServiceKP, authServiceRecord } = await initContext()
    const authService = context.service<AuthService>(DEFAULT_ALIAS)

    // Build intermediate credentials as the external auth service would produce
    const credentials: AuthCredentials = {
      type: 'ed25519-basic-token',
      challenge: 'unique-nonce-' + Date.now(),
      credential: authServiceRecord.id, // must match trustedUser.id
      role: AuthRole.User,
      userId: 'user-123',
      scopes: ['*'],
      profileId: 'profile-abc',
    }

    // Sign the credentials with the auth service's secret key
    const signedToken = await makeEnvelopeModel<AuthCredentials>(AuthroizationType.Ed25519BasicToken)
      .send(credentials, null).sign(authServiceKP, EnvelopeKind.Token)

    const result = await authService.authenticate({ token: signedToken })

    expect(result.token).toStartWith('ED25519-BASIC-TOKEN ')
    // The token should be verifiable with the app's own key
    const [, authorization] = result.token.split(' ')
    expect(authorization.length).toBeGreaterThan(0)
  })

  test('rejects credentials signed by an unknown key', async () => {
    const { context } = await initContext()
    const authService = context.service<AuthService>(DEFAULT_ALIAS)

    const unknownKP = makeFixtureKeyPair('unknown-signer')

    const credentials: AuthCredentials = {
      type: 'ed25519-basic-token',
      challenge: 'nonce-' + Date.now(),
      credential: 'wrong-id',
      role: AuthRole.User,
      userId: 'user-456',
      scopes: ['*'],
    }

    const signedToken = await makeEnvelopeModel<AuthCredentials>(AuthroizationType.Ed25519BasicToken)
      .send(credentials, null).sign(unknownKP, EnvelopeKind.Token)

    await expect(authService.authenticate({ token: signedToken })).rejects.toBeInstanceOf(AuthenFailed)
  })

  test('rejects when credential does not match trusted user id (anti-impersonation)', async () => {
    const { context, authServiceKP } = await initContext()
    const authService = context.service<AuthService>(DEFAULT_ALIAS)

    const credentials: AuthCredentials = {
      type: 'ed25519-basic-token',
      challenge: 'nonce-impersonate-' + Date.now(),
      credential: 'wrong-service-user-id', // does not match authServiceRecord.id
      role: AuthRole.User,
      userId: 'user-789',
      scopes: ['*'],
    }

    const signedToken = await makeEnvelopeModel<AuthCredentials>(AuthroizationType.Ed25519BasicToken)
      .send(credentials, null).sign(authServiceKP, EnvelopeKind.Token)

    await expect(authService.authenticate({ token: signedToken })).rejects.toBeInstanceOf(AuthenFailed)
  })

  test('rejects replay of already-used challenge (anti-replay cache)', async () => {
    const { context, authServiceKP, authServiceRecord } = await initContext()
    const authService = context.service<AuthService>(DEFAULT_ALIAS)

    const challenge = 'replay-nonce-' + Date.now()
    const credentials: AuthCredentials = {
      type: 'ed25519-basic-token',
      challenge,
      credential: authServiceRecord.id,
      role: AuthRole.User,
      userId: 'user-replay',
      scopes: ['*'],
    }

    const signedToken = await makeEnvelopeModel<AuthCredentials>(AuthroizationType.Ed25519BasicToken)
      .send(credentials, null).sign(authServiceKP, EnvelopeKind.Token)

    // First call succeeds
    await authService.authenticate({ token: signedToken })

    // Second call with same challenge should fail (replay)
    await expect(authService.authenticate({ token: signedToken })).rejects.toBeInstanceOf(AuthenFailed)
  })
})

describe('@owlmeans/server-auth — handle (mode 3: verify bearer token)', () => {
  test('verifies a bearer token issued by authenticate()', async () => {
    const { context, authServiceKP, authServiceRecord } = await initContext()
    const authService = context.service<AuthService>(DEFAULT_ALIAS)

    // First get a valid bearer via authenticate
    const credentials: AuthCredentials = {
      type: 'ed25519-basic-token',
      challenge: 'handle-nonce-' + Date.now(),
      credential: authServiceRecord.id,
      role: AuthRole.User,
      userId: 'user-handle',
      scopes: ['*'],
    }

    const signedToken = await makeEnvelopeModel<AuthCredentials>(AuthroizationType.Ed25519BasicToken)
      .send(credentials, null).sign(authServiceKP, EnvelopeKind.Token)

    const { token: bearer } = await authService.authenticate({ token: signedToken })

    // Now verify it via handle()
    const auth: { value: Auth | null } = { value: null }
    const req = { headers: { authorization: bearer } } as any
    const res = { resolve: (v: Auth) => { auth.value = v } } as any

    const handled = await authService.handle(req, res)

    expect(handled).toBe(true)
    expect(auth.value).not.toBeNull()
    expect(auth.value!.userId).toBe('user-handle')
    expect(auth.value!.scopes).toEqual(['*'])
  })

  test('returns false for missing authorization header', async () => {
    const { context } = await initContext()
    const authService = context.service<AuthService>(DEFAULT_ALIAS)

    const req = { headers: {} } as any
    const res = { resolve: () => {} } as any

    const handled = await authService.handle(req, res)

    expect(handled).toBe(false)
  })
})

describe('@owlmeans/server-auth — match', () => {
  test('matches Ed25519BasicToken authorization header', async () => {
    const { context } = await initContext()
    const authService = context.service<AuthService>(DEFAULT_ALIAS)

    const req = { headers: { authorization: 'ED25519-BASIC-TOKEN abc123' } } as any
    const res = {} as any
    expect(await authService.match(req, res)).toBe(true)
  })

  test('does not match other authorization types', async () => {
    const { context } = await initContext()
    const authService = context.service<AuthService>(DEFAULT_ALIAS)

    const req = { headers: { authorization: 'Bearer xyz' } } as any
    const res = {} as any
    expect(await authService.match(req, res)).toBe(false)
  })
})
