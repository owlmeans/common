import { afterEach, describe, expect, test } from 'bun:test'
import { forgetCachedClientIdMetadataDocument, registerDcrClient, resolveClient } from '../src/clients.js'
import { handleRegister } from '../src/handlers/register.js'
import { makeTestContext, TEST_CLIENT_ID } from './context.js'

// A public IP literal, never a hostname — `isIP()` short-circuits before any DNS lookup, so
// these tests never depend on this sandbox's outbound DNS resolution actually working.
const CIMD_URL = 'https://93.184.216.34/oauth/client-metadata.json'
const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  forgetCachedClientIdMetadataDocument(CIMD_URL)
})

const jsonResponse = (body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } })

const CIMD_DOC = {
  client_id: CIMD_URL, client_name: 'Example MCP Client',
  redirect_uris: ['http://127.0.0.1:3000/callback', 'http://localhost:3000/callback'],
  grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'none',
}

describe('resolveClient — static', () => {
  test('finds a client declared in configuration', async () => {
    const context = makeTestContext()
    const client = await resolveClient(context, TEST_CLIENT_ID)
    expect(client?.origin).toBe('static')
    expect(client?.clientName).toBe('Viable MCP')
  })

  test('answers null for a name nothing declared, fetched, or registered', async () => {
    const context = makeTestContext()
    expect(await resolveClient(context, 'nobody')).toBeNull()
  })
})

describe('resolveClient — Client ID Metadata Documents', () => {
  test('fetches and validates a well-formed document', async () => {
    globalThis.fetch = (async () => jsonResponse(CIMD_DOC)) as typeof fetch
    const context = makeTestContext()

    const client = await resolveClient(context, CIMD_URL)
    expect(client?.origin).toBe('cimd')
    expect(client?.clientName).toBe('Example MCP Client')
    expect(client?.redirectUris).toEqual(CIMD_DOC.redirect_uris)
  })

  test('refuses a document whose client_id does not match the URL it was fetched from', async () => {
    globalThis.fetch = (async () => jsonResponse({ ...CIMD_DOC, client_id: 'https://someone-else.example/doc.json' })) as typeof fetch
    const context = makeTestContext()

    expect(await resolveClient(context, CIMD_URL)).toBeNull()
  })

  test('refuses a document missing redirect_uris', async () => {
    globalThis.fetch = (async () => jsonResponse({ client_id: CIMD_URL, client_name: 'X', redirect_uris: [] })) as typeof fetch
    const context = makeTestContext()

    expect(await resolveClient(context, CIMD_URL)).toBeNull()
  })

  test('never treats an ordinary client_id string as a CIMD URL', async () => {
    let called = false
    globalThis.fetch = (async () => { called = true; return jsonResponse(CIMD_DOC) }) as typeof fetch
    const context = makeTestContext()

    expect(await resolveClient(context, 'not-a-url')).toBeNull()
    expect(called).toBe(false)
  })

  test('is not offered when the deployment turned CIMD off', async () => {
    let called = false
    globalThis.fetch = (async () => { called = true; return jsonResponse(CIMD_DOC) }) as typeof fetch
    const context = makeTestContext({ allowClientIdMetadataDocuments: false })

    expect(await resolveClient(context, CIMD_URL)).toBeNull()
    expect(called).toBe(false)
  })

  test('caches a valid document and does not re-fetch inside the cache window', async () => {
    let calls = 0
    globalThis.fetch = (async () => { calls += 1; return jsonResponse(CIMD_DOC, { 'cache-control': 'max-age=3600' }) }) as typeof fetch
    const context = makeTestContext()

    await resolveClient(context, CIMD_URL)
    await resolveClient(context, CIMD_URL)
    expect(calls).toBe(1)
  })

  test('a refused SSRF-guarded address never reaches fetch', async () => {
    let called = false
    globalThis.fetch = (async () => { called = true; return jsonResponse(CIMD_DOC) }) as typeof fetch
    const context = makeTestContext()

    expect(await resolveClient(context, 'https://127.0.0.1/client.json')).toBeNull()
    expect(called).toBe(false)
  })
})

describe('Dynamic Client Registration', () => {
  test('registers a public client and it is then resolvable', async () => {
    const context = makeTestContext()
    const outcome = await handleRegister(context, { client_name: 'A CLI', redirect_uris: ['http://localhost:4000/callback'] })
    expect(outcome.status).toBe(201)
    const clientId = (outcome.body as any).client_id as string
    expect((outcome.body as any).token_endpoint_auth_method).toBe('none')

    const resolved = await resolveClient(context, clientId)
    expect(resolved?.origin).toBe('dcr')
    expect(resolved?.clientName).toBe('A CLI')
  })

  test('refuses a confidential-client auth method', async () => {
    const context = makeTestContext()
    const outcome = await handleRegister(context, { redirect_uris: ['http://localhost/cb'], token_endpoint_auth_method: 'client_secret_basic' as any })
    expect(outcome.status).toBe(400)
  })

  test('refuses a non-https, non-loopback redirect URI', async () => {
    const context = makeTestContext()
    const outcome = await handleRegister(context, { redirect_uris: ['http://not-loopback.example/cb'] })
    expect(outcome.status).toBe(400)
  })

  test('refuses a redirect URI carrying a fragment', async () => {
    const context = makeTestContext()
    const outcome = await handleRegister(context, { redirect_uris: ['https://app.example.com/cb#frag'] })
    expect(outcome.status).toBe(400)
  })

  test('is refused outright when the deployment turned DCR off', async () => {
    const context = makeTestContext({ allowDynamicRegistration: false })
    const outcome = await handleRegister(context, { redirect_uris: ['http://localhost/cb'] })
    expect(outcome.status).toBe(403)
  })

  test('registerDcrClient rejects more than the configured maximum of redirect URIs', async () => {
    const context = makeTestContext()
    const many = Array.from({ length: 11 }, (_, i) => `http://localhost:${3000 + i}/cb`)
    await expect(registerDcrClient(context, { redirect_uris: many })).rejects.toThrow()
  })
})
