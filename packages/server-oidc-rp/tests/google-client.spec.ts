import { describe, test, expect, afterEach } from 'bun:test'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { makeTestContext } from './context.js'
import { googleClientPlugin } from '../src/auth/plugins/google-client.js'
import { GOOGLE_SERVICE } from '@owlmeans/oidc'
import { AuthenFailed, AuthenPayloadError, AuthRole } from '@owlmeans/auth'
import { UnknownRecordError } from '@owlmeans/resource'
import { makeOidcCacheHelper } from '../src/utils/cache.js'
import { AUTH_CACHE } from '@owlmeans/server-auth'
import type { Resource } from '@owlmeans/resource'
import type { OIDCAuthCache } from '../src/utils/types.js'
import type { Config, Context } from '../src/types.js'
import type { BasicContext } from '@owlmeans/context'

const initContext = async () => {
  const ctx = makeTestContext()
  ctx.configure()
  await ctx.init()
  return ctx
}

describe('@owlmeans/server-oidc-rp — googleClientPlugin.init', () => {
  test('rejects when request.source is missing', async () => {
    const ctx = await initContext()
    const plugin = googleClientPlugin(ctx as unknown as Context, GOOGLE_SERVICE)

    await expect(
      plugin.init({ type: 'google-oauth', source: undefined as any })
    ).rejects.toBeInstanceOf(AuthenPayloadError)
  })

  test('returns a Google auth URL with correct params', async () => {
    const ctx = await initContext()
    const plugin = googleClientPlugin(ctx as unknown as Context, GOOGLE_SERVICE)

    const result = await plugin.init({
      type: 'google-oauth',
      source: 'https://example.com/authentication/login/google-oauth',
    })

    expect(result.challenge).toContain('https://accounts.google.com/o/oauth2/v2/auth')

    const url = new URL(result.challenge)
    expect(url.searchParams.get('client_id')).toBe('google-client-id-123')
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/authentication/login/google-oauth')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).not.toBeNull()
    expect(url.searchParams.get('state')!.length).toBeGreaterThan(0)
    expect(url.searchParams.get('code_challenge')).not.toBeNull()
  })

  test('caches PKCE verifier under verifierId(state) with redirectUri', async () => {
    const ctx = await initContext()
    const plugin = googleClientPlugin(ctx as unknown as Context, GOOGLE_SERVICE)

    const result = await plugin.init({
      type: 'google-oauth',
      source: 'https://example.com/auth/login/google-oauth',
    })

    const url = new URL(result.challenge)
    const state = url.searchParams.get('state')!

    const cache = (ctx as unknown as BasicContext<Config>).resource<Resource<OIDCAuthCache>>(AUTH_CACHE)
    const record = await cache.load(makeOidcCacheHelper(ctx as unknown as Context).verifierId(state))

    expect(record).not.toBeNull()
    expect(record!.verifier).toBeDefined()
    expect(record!.verifier!.length).toBeGreaterThan(0)
    expect(record!.client).toBe('google-client-id-123')
    expect(record!.redirectUri).toBe('https://example.com/auth/login/google-oauth')
  })
})

describe('@owlmeans/server-oidc-rp — googleClientPlugin.authenticate', () => {
  test('rejects when code is missing', async () => {
    const ctx = await initContext()
    const plugin = googleClientPlugin(ctx as unknown as Context, GOOGLE_SERVICE)

    await expect(
      plugin.authenticate({
        type: 'google-oauth',
        challenge: '',
        credential: 'state=abc123',
        role: AuthRole.User,
        userId: 'code',
        scopes: ['*'],
      })
    ).rejects.toBeInstanceOf(AuthenPayloadError)
  })

  test('rejects when state is missing', async () => {
    const ctx = await initContext()
    const plugin = googleClientPlugin(ctx as unknown as Context, GOOGLE_SERVICE)

    await expect(
      plugin.authenticate({
        type: 'google-oauth',
        challenge: '',
        credential: 'code=abc123',
        role: AuthRole.User,
        userId: 'code',
        scopes: ['*'],
      })
    ).rejects.toBeInstanceOf(AuthenPayloadError)
  })

  test('rejects when verifier not found for state', async () => {
    const ctx = await initContext()
    const plugin = googleClientPlugin(ctx as unknown as Context, GOOGLE_SERVICE)

    await expect(
      plugin.authenticate({
        type: 'google-oauth',
        challenge: '',
        credential: 'code=abc123&state=nonexistent-state',
        role: AuthRole.User,
        userId: 'code',
        scopes: ['*'],
      })
    ).rejects.toBeInstanceOf(UnknownRecordError)
  })
})

describe('@owlmeans/server-oidc-rp — googleClientPlugin.authenticate and the verified address', () => {
  const running: Server[] = []
  afterEach(() => {
    while (running.length > 0) running.pop()?.close()
  })

  /** Google's token and userinfo endpoints, answering `userinfo` for any code. */
  const google = async (userinfo: Record<string, unknown>) => {
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(req.url?.startsWith('/token') === true ? { access_token: 'google-access' } : userinfo))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    running.push(server)
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const ctx = makeTestContext()
    Object.assign(ctx.cfg.oidc.providers![0], { tokenEndpoint: `${base}/token`, userinfoEndpoint: `${base}/userinfo` })
    ctx.configure()
    await ctx.init()
    const cache = (ctx as unknown as BasicContext<Config>).resource<Resource<OIDCAuthCache>>(AUTH_CACHE)
    await cache.create({ id: makeOidcCacheHelper(ctx as unknown as Context).verifierId('google-state'), verifier: 'v', client: 'google-client-id-123', redirectUri: 'https://example.com/cb' })

    return googleClientPlugin(ctx as unknown as Context, GOOGLE_SERVICE).authenticate({
      type: 'google-oauth', challenge: '', credential: 'code=abc123&state=google-state',
      role: AuthRole.User, userId: 'code', scopes: ['*'],
    })
  }

  const person = { sub: 'google-sub-1', email: 'person@example.test' }

  test.each([
    ['an address Google says is unverified', { ...person, email_verified: false }],
    ['an address Google says nothing about', person],
    ['a verification that is not the boolean true', { ...person, email_verified: 'true' }],
  ])('refuses %s', async (_, userinfo) => {
    const failure = await google(userinfo).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AuthenFailed)
    expect((failure as Error).message).toContain('email-verified')
  })

  test('a verified address goes on to the account linking', async () => {
    // No linking service is registered here, so reaching it is the failure that proves the
    // address check passed.
    const failure = await google({ ...person, email_verified: true }).catch((error: unknown) => error)

    expect((failure as Error).message).toContain('google.account.store')
  })
})
