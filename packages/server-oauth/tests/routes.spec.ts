import { afterEach, describe, expect, test } from 'bun:test'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import type { Middleware } from '@owlmeans/context'
import { createPkcePair } from '@owlmeans/oauth'
import { appendOAuthRoutes } from '../src/route.js'
import { makeTestContext, seedProfile, session, TEST_CLIENT_ID, TEST_REDIRECT_URI } from './context.js'
import { approveConsent } from '../src/handlers/consent.js'
import { makeOAuthProtocols } from '@owlmeans/oauth'

/**
 * The raw routes over a REAL Fastify instance. The handlers are tested directly elsewhere; what
 * only a server can prove is the wire: form bodies parsed inside the package's own plugin
 * boundary, the two well-known routes, the redirect, and the RFC-shaped answers.
 */
let server: FastifyInstance | undefined
afterEach(async () => { await server?.close(); server = undefined })

const mounted = async (opts: Parameters<typeof makeTestContext>[0] = {}) => {
  const context = makeTestContext(opts)
  server = Fastify()
  const captured: Middleware[] = []
  const stub = Object.assign(Object.create(context), {
    registerMiddleware: (middleware: Middleware) => { captured.push(middleware); return stub },
    getApiServer: () => ({ server }),
  })
  appendOAuthRoutes(stub)
  await captured[0].apply(stub as never)
  await server.ready()

  return { context, server }
}

const form = (fields: Record<string, string>) => ({
  method: 'POST' as const,
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  payload: new URLSearchParams(fields).toString(),
})

describe('the raw OAuth routes', () => {
  test('serves the authorization server metadata, cacheable', async () => {
    const { server } = await mounted()
    const response = await server.inject('/.well-known/oauth-authorization-server')

    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toContain('max-age')
    expect(response.json()).toMatchObject({
      issuer: 'https://api.example.com', code_challenge_methods_supported: ['S256'],
      token_endpoint: 'https://api.example.com/oauth/token',
    })
  })

  test('serves each resource\'s metadata at its own well-known path, and 404s an unknown one', async () => {
    const { server } = await mounted()

    expect((await server.inject('/.well-known/oauth-protected-resource')).json().resource)
      .toBe('https://api.example.com')
    expect((await server.inject('/.well-known/oauth-protected-resource/mcp')).json().resource)
      .toBe('https://api.example.com/mcp')
    expect((await server.inject('/.well-known/oauth-protected-resource/nothing')).statusCode).toBe(404)
  })

  test('the device grant over the wire: form in, RFC 8628 JSON out, then a pending poll', async () => {
    const { server } = await mounted()

    const started = await server.inject({ url: '/oauth/device_authorization', ...form({ client_id: TEST_CLIENT_ID }) })
    expect(started.statusCode).toBe(200)
    const body = started.json()
    expect(body.user_code).toMatch(/^[A-Z]{4}-[A-Z]{4}$/)
    expect(body.verification_uri).toBe('https://app.example.com/oauth/device')

    const poll = await server.inject({ url: '/oauth/token', ...form({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: body.device_code, client_id: TEST_CLIENT_ID,
    }) })
    expect(poll.statusCode).toBe(400)
    expect(poll.json()).toEqual({ error: 'authorization_pending' })
    // A token answer is never cacheable.
    expect(poll.headers['cache-control']).toBe('no-store')
  })

  test('the code grant over the wire: authorize redirects to consent, then the exchange yields a token', async () => {
    const { server, context } = await mounted()
    await seedProfile(context)
    const pkce = createPkcePair()

    const authorize = await server.inject({
      url: '/oauth/authorize', query: {
        response_type: 'code', client_id: TEST_CLIENT_ID, redirect_uri: TEST_REDIRECT_URI, state: 'xyz',
        code_challenge: pkce.challenge, code_challenge_method: 'S256',
      },
    })
    expect(authorize.statusCode).toBe(302)
    const consent = new URL(authorize.headers.location as string)
    expect(consent.origin + consent.pathname).toBe('https://app.example.com/oauth/consent')

    // The person approves through the guarded API (bound by the application, not this package).
    const protocols = makeOAuthProtocols()
    const res: any = { resolve: (v: unknown) => { res.value = v }, reject: (e: Error) => { res.error = e } }
    await approveConsent(protocols.approve).bind({ ref: { ctx: context } })(
      { ...session(), params: { ref: consent.searchParams.get('ref') } } as never, res
    )
    const redirect = new URL(res.value.redirect)
    expect(redirect.searchParams.get('state')).toBe('xyz')

    const token = await server.inject({ url: '/oauth/token', ...form({
      grant_type: 'authorization_code', code: redirect.searchParams.get('code')!, redirect_uri: TEST_REDIRECT_URI,
      client_id: TEST_CLIENT_ID, code_verifier: pkce.verifier,
    }) })
    expect(token.statusCode).toBe(200)
    expect(token.json()).toMatchObject({ token_type: 'Bearer' })
  })

  test('an unregistered redirect_uri is a plain 400 — never a redirect', async () => {
    const { server } = await mounted()
    const response = await server.inject({
      url: '/oauth/authorize', query: {
        response_type: 'code', client_id: TEST_CLIENT_ID, redirect_uri: 'https://evil.example/cb',
        code_challenge: 'x'.repeat(43), code_challenge_method: 'S256',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.headers.location).toBeUndefined()
  })

  test('registration answers 201 with a public client, and revocation always answers 200', async () => {
    const { server } = await mounted()

    const registered = await server.inject({
      method: 'POST', url: '/oauth/register', payload: { client_name: 'X', redirect_uris: ['http://localhost/cb'] },
    })
    expect(registered.statusCode).toBe(201)
    expect(registered.json().token_endpoint_auth_method).toBe('none')

    const revoked = await server.inject({ url: '/oauth/revoke', ...form({ token: 'vib_unknown' }) })
    expect(revoked.statusCode).toBe(200)
  })
})
