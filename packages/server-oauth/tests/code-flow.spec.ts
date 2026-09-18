import { describe, expect, test } from 'bun:test'
import { createPkcePair, makeOAuthProtocols } from '@owlmeans/oauth'
import { handleAuthorize } from '../src/handlers/authorize.js'
import { approveConsent, denyConsent, loadConsent } from '../src/handlers/consent.js'
import { handleToken } from '../src/handlers/token.js'
import {
  makeTestContext, seedProfile, session, TEST_CLIENT_ID, TEST_REDIRECT_URI
} from './context.js'

const protocols = makeOAuthProtocols()
const load = loadConsent(protocols.load)
const approve = approveConsent(protocols.approve)
const deny = denyConsent(protocols.deny)

const invoke = async (handler: any, context: any, req: any): Promise<any> => {
  const res: any = { resolve: (value: unknown) => { res.value = value }, reject: (e: Error) => { res.error = e } }
  await handler.bind({ ref: { ctx: context } })(req, res)
  if (res.error != null) throw res.error

  return res.value
}

const consentReq = (ref: string): any => ({ ...session(), params: { ref } })

const authorize = (overrides: Record<string, string | undefined> = {}, pkce = createPkcePair()) => ({
  pkce,
  query: {
    response_type: 'code', client_id: TEST_CLIENT_ID, redirect_uri: TEST_REDIRECT_URI,
    state: 's-1', code_challenge: pkce.challenge, code_challenge_method: 'S256', ...overrides,
  },
})

describe('authorization code flow, end to end', () => {
  test('authorize → consent → approve → exchange, with the exact verifier', async () => {
    const context = makeTestContext()
    await seedProfile(context)
    const { pkce, query } = authorize()

    const started = await handleAuthorize(context, query)
    expect(started.kind).toBe('to-consent')
    const ref = new URL((started as any).location).searchParams.get('ref')!

    const view = await invoke(load, context, consentReq(ref))
    expect(view.kind).toBe('code')
    expect(view.redirectHost).toBe('localhost')
    expect(view.client.name).toBe('Viable MCP')

    const approved = await invoke(approve, context, consentReq(ref))
    const redirect = new URL(approved.redirect)
    expect(redirect.origin + redirect.pathname).toBe(TEST_REDIRECT_URI)
    expect(redirect.searchParams.get('state')).toBe('s-1')
    expect(redirect.searchParams.get('iss')).toBe('https://api.example.com')
    const code = redirect.searchParams.get('code')!

    const token = await handleToken(context, {
      grant_type: 'authorization_code', code, redirect_uri: TEST_REDIRECT_URI,
      client_id: TEST_CLIENT_ID, code_verifier: pkce.verifier,
    })
    expect(token.status).toBe(200)
    expect((token.body as any).access_token).toMatch(/^tst_/)
  })

  test('a code is single-use — the second exchange is refused', async () => {
    const context = makeTestContext()
    await seedProfile(context)
    const { pkce, query } = authorize()
    const started = await handleAuthorize(context, query)
    const ref = new URL((started as any).location).searchParams.get('ref')!
    const approved = await invoke(approve, context, consentReq(ref))
    const code = new URL(approved.redirect).searchParams.get('code')!

    const exchange = { grant_type: 'authorization_code', code, redirect_uri: TEST_REDIRECT_URI, client_id: TEST_CLIENT_ID, code_verifier: pkce.verifier }
    const first = await handleToken(context, exchange)
    expect(first.status).toBe(200)
    const second = await handleToken(context, exchange)
    expect(second.status).toBe(400)
    expect((second.body as any).error).toBe('invalid_grant')
  })

  test('the wrong verifier is refused (PKCE actually checked)', async () => {
    const context = makeTestContext()
    await seedProfile(context)
    const { query } = authorize()
    const started = await handleAuthorize(context, query)
    const ref = new URL((started as any).location).searchParams.get('ref')!
    const approved = await invoke(approve, context, consentReq(ref))
    const code = new URL(approved.redirect).searchParams.get('code')!

    const outcome = await handleToken(context, {
      grant_type: 'authorization_code', code, redirect_uri: TEST_REDIRECT_URI,
      client_id: TEST_CLIENT_ID, code_verifier: 'wrong-verifier-wrong-verifier-wrong-verifier',
    })
    expect(outcome.status).toBe(400)
    expect((outcome.body as any).error).toBe('invalid_grant')
  })

  test('deny redirects back with access_denied, never approaching the token endpoint', async () => {
    const context = makeTestContext()
    const { query } = authorize()
    const started = await handleAuthorize(context, query)
    const ref = new URL((started as any).location).searchParams.get('ref')!

    const denied = await invoke(deny, context, consentReq(ref))
    const redirect = new URL(denied.redirect)
    expect(redirect.searchParams.get('error')).toBe('access_denied')
    expect(redirect.searchParams.get('state')).toBe('s-1')
  })

  test('an unregistered redirect_uri is refused BEFORE anything is created — never a redirect', async () => {
    const context = makeTestContext()
    const { query } = authorize({ redirect_uri: 'https://evil.example/steal' })

    const outcome = await handleAuthorize(context, query)
    expect(outcome.kind).toBe('refused')
  })

  test('an unregistered client is refused, never redirected to', async () => {
    const context = makeTestContext()
    const { query } = authorize({ client_id: 'nobody' })

    const outcome = await handleAuthorize(context, query)
    expect(outcome.kind).toBe('refused')
  })

  test('a loopback redirect_uri matches on any port — Claude Code\'s ephemeral callback port', async () => {
    const context = makeTestContext()
    const { query } = authorize({ redirect_uri: 'http://localhost:53219/callback' })

    const outcome = await handleAuthorize(context, query)
    expect(outcome.kind).toBe('to-consent')
  })

  test('a missing/wrong PKCE method is redirected back as invalid_request, redirect_uri already trusted', async () => {
    const context = makeTestContext()
    const { query } = authorize({ code_challenge_method: 'plain' })

    const outcome = await handleAuthorize(context, query)
    expect(outcome.kind).toBe('redirect')
    const redirect = new URL((outcome as any).location)
    expect(redirect.searchParams.get('error')).toBe('invalid_request')
  })

  test('an unknown resource is redirected back as invalid_target', async () => {
    const context = makeTestContext()
    const { query } = authorize({ resource: 'https://not-mine.example' })

    const outcome = await handleAuthorize(context, query)
    expect(outcome.kind).toBe('redirect')
    expect(new URL((outcome as any).location).searchParams.get('error')).toBe('invalid_target')
  })

  test('the minted token is scoped to the resource it was requested for', async () => {
    const context = makeTestContext()
    await seedProfile(context)
    const { pkce, query } = authorize({ resource: 'https://api.example.com/mcp' })
    const started = await handleAuthorize(context, query)
    const ref = new URL((started as any).location).searchParams.get('ref')!
    const approved = await invoke(approve, context, consentReq(ref))
    const code = new URL(approved.redirect).searchParams.get('code')!

    await handleToken(context, {
      grant_type: 'authorization_code', code, redirect_uri: TEST_REDIRECT_URI,
      client_id: TEST_CLIENT_ID, code_verifier: pkce.verifier,
    })

    const stored = await context.resource<any>('auth-token:token').list({ entityId: 'entity-1' })
    expect(stored.items[0].audience).toEqual(['https://api.example.com/mcp'])
  })
})
