import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeCliCredentials } from '../src/holder.js'
import { readCredentialsFile } from '../src/env-file.js'
import { ENV_CREDENTIALS_FILE } from '../src/consts.js'

const originalFetch = globalThis.fetch
const CLIENT_ID = 'test-cli'
let ISSUER: string
let testSeq = 0

let dir: string
let credentialsPath: string

const asMetadata = (issuer: string) => ({
  issuer,
  authorization_endpoint: `${issuer}/oauth/authorize`,
  token_endpoint: `${issuer}/oauth/token`,
  device_authorization_endpoint: `${issuer}/oauth/device_authorization`,
  revocation_endpoint: `${issuer}/oauth/revoke`,
  scopes_supported: ['*'],
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'urn:ietf:params:oauth:grant-type:device_code'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  client_id_metadata_document_supported: true,
  authorization_response_iss_parameter_supported: true,
})

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cli-auth-holder-'))
  credentialsPath = join(dir, '.owlmeans')
  // A distinct host per test: `inFlightByApiUrl` is module-level state, and a test that
  // deliberately times out (SignInRequired) leaves its background poll running past its own
  // `afterEach` — a shared apiUrl would let that poll's later activity leak into the next test.
  ISSUER = `https://api-${++testSeq}.example.com`
})
afterEach(async () => {
  globalThis.fetch = originalFetch
  await rm(dir, { recursive: true, force: true })
})

/** A fake server: metadata, one device_authorization call, and a token endpoint whose answer
 * `pendingUntil` polls can advance past `authorization_pending` on demand. */
const fakeServer = (opts: { authorizeAfterPolls?: number } = {}) => {
  let deviceCalls = 0
  let tokenCalls = 0
  const authorizeAfterPolls = opts.authorizeAfterPolls ?? 0

  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const href = url.toString()
    if (href.endsWith('/.well-known/oauth-authorization-server')) return json(asMetadata(ISSUER))
    if (href.endsWith('/oauth/device_authorization')) {
      deviceCalls += 1

      return json({
        device_code: `dc-${deviceCalls}`, user_code: `CODE-${deviceCalls}`,
        verification_uri: `${ISSUER}/oauth/device`, expires_in: 600, interval: 0.001,
      })
    }
    if (href.endsWith('/oauth/token')) {
      tokenCalls += 1

      return tokenCalls > authorizeAfterPolls
        ? json({ access_token: 'vib_new-token', token_type: 'Bearer', expires_in: 100 })
        : json({ error: 'authorization_pending' }, 400)
    }
    if (href.endsWith('/oauth/revoke')) return new Response(null, { status: 200 })

    throw new Error(`unexpected fetch: ${href} ${init?.method ?? 'GET'}`)
  }) as typeof fetch

  return { deviceCallCount: () => deviceCalls }
}

const opts = (extra: Record<string, unknown> = {}) => ({
  apiUrl: ISSUER, clientId: CLIENT_ID, tokenEnvKey: 'VIABLE_API_TOKEN', apiUrlEnvKey: 'VIABLE_API_URL',
  env: { [ENV_CREDENTIALS_FILE]: credentialsPath } as unknown as NodeJS.ProcessEnv,
  ...extra,
})

describe('token()', () => {
  test('prefers the environment over the file', async () => {
    const credentials = makeCliCredentials(opts({
      env: { [ENV_CREDENTIALS_FILE]: credentialsPath, VIABLE_API_TOKEN: 'from-env' } as unknown as NodeJS.ProcessEnv,
    }))
    expect(await credentials.token()).toBe('from-env')
  })

  test('falls back to a bound file token', async () => {
    fakeServer()
    const credentials = makeCliCredentials(opts())
    await credentials.require()
    expect(await credentials.token()).toBe('vib_new-token')
  })

  test('refuses a file token bound to a different API URL', async () => {
    const { setEnvValues } = await import('../src/env-file.js')
    await setEnvValues(credentialsPath, { VIABLE_API_TOKEN: 'vib_other', VIABLE_API_URL: 'https://other.example.com' })

    const credentials = makeCliCredentials(opts())
    expect(await credentials.token()).toBeNull()
  })

  test('accepts a file token when no URL was ever recorded', async () => {
    const { setEnvValues } = await import('../src/env-file.js')
    await setEnvValues(credentialsPath, { VIABLE_API_TOKEN: 'vib_no-url-recorded' })

    const credentials = makeCliCredentials(opts())
    expect(await credentials.token()).toBe('vib_no-url-recorded')
  })
})

describe('require()', () => {
  test('leaves no ceiling timer behind once signed in — a pending timer would keep `login` alive', async () => {
    fakeServer()
    const CEILING = 987_654
    const armed = new Set<unknown>()
    const realSet = globalThis.setTimeout
    const realClear = globalThis.clearTimeout
    globalThis.setTimeout = ((fn: () => void, ms?: number, ...rest: unknown[]) => {
      const handle = realSet(fn, ms, ...rest)
      if (ms === CEILING) armed.add(handle)

      return handle
    }) as typeof setTimeout
    globalThis.clearTimeout = ((handle: Parameters<typeof clearTimeout>[0]) => {
      armed.delete(handle)
      realClear(handle)
    }) as typeof clearTimeout

    try {
      const credentials = makeCliCredentials(opts())
      expect(await credentials.require(CEILING)).toBe('vib_new-token')
      expect(armed.size).toBe(0)
    } finally {
      globalThis.setTimeout = realSet
      globalThis.clearTimeout = realClear
    }
  })

  test('signs in and persists the token bound to this API URL', async () => {
    fakeServer()
    const notifications: string[] = []
    const credentials = makeCliCredentials(opts({ onNotify: (m: string) => notifications.push(m) }))

    const token = await credentials.require(5_000)
    expect(token).toBe('vib_new-token')
    expect(notifications.some(m => m.includes('CODE-1'))).toBe(true)
    expect(notifications).toContain('Signed in.')

    const file = await readCredentialsFile({ [ENV_CREDENTIALS_FILE]: credentialsPath })
    expect(file.VIABLE_API_TOKEN).toBe('vib_new-token')
    expect(file.VIABLE_API_URL).toBe(ISSUER)
  })

  test('polls through authorization_pending until approved', async () => {
    fakeServer({ authorizeAfterPolls: 3 })
    const credentials = makeCliCredentials(opts())
    expect(await credentials.require(5_000)).toBe('vib_new-token')
  })

  test('returns immediately once a token already exists — no network call at all', async () => {
    let called = false
    globalThis.fetch = (async () => { called = true; throw new Error('should not be called') }) as typeof fetch
    const credentials = makeCliCredentials(opts({
      env: { [ENV_CREDENTIALS_FILE]: credentialsPath, VIABLE_API_TOKEN: 'already-here' } as unknown as NodeJS.ProcessEnv,
    }))

    expect(await credentials.require()).toBe('already-here')
    expect(called).toBe(false)
  })

  test('throws SignInRequired when nobody approves within the wait, naming the URL and code', async () => {
    fakeServer({ authorizeAfterPolls: 1_000_000 })
    const credentials = makeCliCredentials(opts())

    let caught: any
    try {
      await credentials.require(50)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeDefined()
    expect(caught.url).toContain('/oauth/device')
    expect(caught.code).toBe('CODE-1')
  })

  test('a second require() call while the first is pending only requests ONE device code', async () => {
    const server = fakeServer({ authorizeAfterPolls: 2 })
    const credentials = makeCliCredentials(opts())

    const [a, b] = await Promise.all([credentials.require(5_000), credentials.require(5_000)])
    expect(a).toBe('vib_new-token')
    expect(b).toBe('vib_new-token')
    expect(server.deviceCallCount()).toBe(1)
  })
})

describe('invalidate()', () => {
  test('forgets a rejected file token so the next require() signs in again', async () => {
    fakeServer()
    const credentials = makeCliCredentials(opts())
    await credentials.require()

    await credentials.invalidate('vib_new-token')
    expect(await credentials.token()).toBeNull()
  })

  test('reports (never silently switches away from) a rejected environment token', async () => {
    const credentials = makeCliCredentials(opts({
      env: { [ENV_CREDENTIALS_FILE]: credentialsPath, VIABLE_API_TOKEN: 'from-env' } as unknown as NodeJS.ProcessEnv,
    }))
    await expect(credentials.invalidate('from-env')).rejects.toThrow()
  })

  test('does nothing for a token that is neither the current file nor env value', async () => {
    const credentials = makeCliCredentials(opts())
    await expect(credentials.invalidate('unrelated-token')).resolves.toBeUndefined()
  })
})

describe('signOut()', () => {
  test('revokes at the server and clears the file', async () => {
    fakeServer()
    const credentials = makeCliCredentials(opts())
    await credentials.require()

    await credentials.signOut()
    expect(await credentials.token()).toBeNull()
  })

  test('is a no-op with nothing signed in', async () => {
    const credentials = makeCliCredentials(opts())
    await expect(credentials.signOut()).resolves.toBeUndefined()
  })
})
