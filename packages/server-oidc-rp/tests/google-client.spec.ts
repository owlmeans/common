import { describe, test, expect } from 'bun:test'
import { makeTestContext } from './context.js'
import { googleClientPlugin } from '../src/auth/plugins/google-client.js'
import { GOOGLE_SERVICE } from '@owlmeans/oidc'
import { AuthenPayloadError, AuthRole } from '@owlmeans/auth'
import { UnknownRecordError } from '@owlmeans/resource'
import { verifierId } from '../src/utils/cache.js'
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
    const record = await cache.load(verifierId(state))

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
