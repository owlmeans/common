import { afterEach, describe, expect, test } from 'bun:test'
import { discoverAuthorizationServer, pollDeviceToken } from '../src/client.js'
import { OAuthError } from '../src/errors.js'
import type { AuthorizationServerMetadata } from '../src/types.js'

const originalFetch = globalThis.fetch

afterEach(() => { globalThis.fetch = originalFetch })

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const SERVER: AuthorizationServerMetadata = {
  issuer: 'https://api.example.com',
  authorization_endpoint: 'https://api.example.com/oauth/authorize',
  token_endpoint: 'https://api.example.com/oauth/token',
  device_authorization_endpoint: 'https://api.example.com/oauth/device_authorization',
  revocation_endpoint: 'https://api.example.com/oauth/revoke',
  registration_endpoint: 'https://api.example.com/oauth/register',
  scopes_supported: ['*'],
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'urn:ietf:params:oauth:grant-type:device_code'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  client_id_metadata_document_supported: true,
  authorization_response_iss_parameter_supported: true,
}

describe('discoverAuthorizationServer', () => {
  test('accepts a document whose issuer matches the request', async () => {
    globalThis.fetch = (async () => jsonResponse(SERVER)) as typeof fetch
    const metadata = await discoverAuthorizationServer('https://api.example.com')
    expect(metadata.token_endpoint).toBe(SERVER.token_endpoint)
  })

  test('rejects a mismatched issuer — a mix-up attempt', async () => {
    globalThis.fetch = (async () => jsonResponse({ ...SERVER, issuer: 'https://attacker.example' })) as typeof fetch
    await expect(discoverAuthorizationServer('https://api.example.com')).rejects.toThrow(OAuthError)
  })

  test('rejects a document with no PKCE support', async () => {
    globalThis.fetch = (async () => jsonResponse({ ...SERVER, code_challenge_methods_supported: [] })) as typeof fetch
    await expect(discoverAuthorizationServer('https://api.example.com')).rejects.toThrow(OAuthError)
  })
})

describe('pollDeviceToken', () => {
  test('authorization_pending then success', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      return calls === 1
        ? jsonResponse({ error: 'authorization_pending' })
        : jsonResponse({ access_token: 'vib_x', token_type: 'Bearer', expires_in: 100 })
    }) as typeof fetch

    const outcome = await pollDeviceToken(SERVER, {
      clientId: 'viable-mcp', deviceCode: 'dc', interval: 0.001, expiresAt: Date.now() + 5_000,
    })
    expect(outcome).toEqual({ status: 'authorized', token: 'vib_x', expiresIn: 100 })
    expect(calls).toBe(2)
  })

  test('access_denied stops polling', async () => {
    globalThis.fetch = (async () => jsonResponse({ error: 'access_denied' })) as typeof fetch
    const outcome = await pollDeviceToken(SERVER, {
      clientId: 'viable-mcp', deviceCode: 'dc', interval: 0.001, expiresAt: Date.now() + 5_000,
    })
    expect(outcome).toEqual({ status: 'denied' })
  })

  test('expires without ever calling the network once the deadline has passed', async () => {
    let called = false
    globalThis.fetch = (async () => { called = true; return jsonResponse({}) }) as typeof fetch
    const outcome = await pollDeviceToken(SERVER, {
      clientId: 'viable-mcp', deviceCode: 'dc', interval: 0.001, expiresAt: Date.now() - 1,
    })
    expect(outcome).toEqual({ status: 'expired' })
    expect(called).toBe(false)
  })

  test('an abort signal stops the poll', async () => {
    globalThis.fetch = (async () => jsonResponse({ error: 'authorization_pending' })) as typeof fetch
    const controller = new AbortController()
    const promise = pollDeviceToken(SERVER, {
      clientId: 'viable-mcp', deviceCode: 'dc', interval: 0.05, expiresAt: Date.now() + 60_000, signal: controller.signal,
    })
    controller.abort()
    expect(await promise).toEqual({ status: 'aborted' })
  })

  test('slow_down grows the interval and reports it', async () => {
    let calls = 0
    const seen: number[] = []
    globalThis.fetch = (async () => {
      calls += 1
      return calls < 3 ? jsonResponse({ error: 'slow_down' }) : jsonResponse({ access_token: 't', token_type: 'Bearer' })
    }) as typeof fetch

    const outcome = await pollDeviceToken(SERVER, {
      clientId: 'c', deviceCode: 'dc', interval: 0.001, expiresAt: Date.now() + 5_000, slowDownStepSec: 0.001,
      onInterval: seconds => seen.push(seconds),
    })
    expect(outcome.status).toBe('authorized')
    expect(seen.length).toBe(2)
    expect(seen[1]).toBeGreaterThan(seen[0])
  })
})
