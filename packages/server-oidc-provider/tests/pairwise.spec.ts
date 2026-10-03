import { describe, it, expect, afterEach } from 'bun:test'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { generateKeyPairSync } from 'node:crypto'
import Provider from 'oidc-provider'
import type { ClientMetadata, KoaContextWithOIDC } from 'oidc-provider'
import { sha256 } from '@noble/hashes/sha2'
import { base58 } from '@scure/base'
import { AppType, makeBasicContext } from '@owlmeans/context'
import { ORGANIZATIONS_CLAIM, ORGANIZATIONS_SCOPE, PERMISSIONS_CLAIM, PERMISSIONS_SCOPE } from '@owlmeans/oidc'
import { combineConfig } from '../src/utils/config.js'
import { makeInteractionPolicy } from '../src/utils/policy.js'
import type { Config } from '../src/types.js'

/**
 * The subject design of the integrated IAM, driven through the pinned `oidc-provider`: the session
 * and the grant name the ACCOUNT (its record id, which never leaves the provider), and every
 * client sees its own pairwise subject for it — in the id_token, in userinfo and in introspection.
 */

const ACCOUNT = '0123456789abcdef01234567'
const SECRET = 'pairwise-spec-secret'
const PREVIEW = 'acme-preview'
const PRODUCTION = 'acme-production'
// A constant sector for every client: its host is never fetched, it only lets one client register
// redirect URIs on several hosts. An unresolvable name proves the provider never fetches it.
const SECTOR = 'https://sector.invalid/iam'

/** The design's subject: the same on every row of one (account, app). */
const profileIdOf = (service: string, accountId: string): string =>
  `${service}:${base58.encode(sha256(new TextEncoder().encode(`${accountId}:${service}`))).slice(0, 22)}`

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PK = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

const ORGANIZATIONS = [{ entitySlug: 'acme', entityKey: 'acme-key', owner: true, home: true }]
const SETS = [{ scope: PREVIEW, permissions: { 'order--view': true }, entitySlug: 'acme' }]

const running: Server[] = []
afterEach(() => {
  while (running.length > 0) running.pop()?.close()
})

const client = (clientId: string): ClientMetadata => ({
  client_id: clientId,
  client_secret: SECRET,
  redirect_uris: [`https://${clientId}.example.test/callback`, `https://${clientId}.other.test/callback`],
  response_types: ['code'],
  grant_types: ['authorization_code', 'refresh_token'],
  token_endpoint_auth_method: 'client_secret_basic',
  scope: `openid email profile offline_access ${PERMISSIONS_SCOPE} ${ORGANIZATIONS_SCOPE}`,
  subject_type: 'pairwise',
  sector_identifier_uri: SECTOR,
})

/** A real provider configured the way `combineConfig` builds it, with the pairwise options passed through. */
const start = async () => {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  running.push(server)
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const context = makeBasicContext({
    ready: false, service: 'pairwise-spec', type: AppType.Backend, services: {}, debug: { all: false },
    oidc: {
      clients: [client(PREVIEW), client(PRODUCTION)],
      defaultKeys: { RS256: { pk: PK } },
      customConfiguration: {
        subjectTypes: ['pairwise'],
        pairwiseIdentifier: async (_ctx: KoaContextWithOIDC, accountId: string, owner: { clientId: string }) =>
          profileIdOf(owner.clientId, accountId),
        sectorIdentifierUriValidate: () => false,
        conformIdTokenClaims: false,
        features: { introspection: { enabled: true } },
        cookies: { keys: ['pairwise-spec-cookie-key'] },
      },
    },
  } as unknown as Config)

  const loaded: string[] = []
  const provider = new Provider(base, {
    ...await combineConfig(context as any, true),
    findAccount: async (_, id) => {
      loaded.push(id)
      return {
        accountId: id,
        claims: async () => ({
          sub: id, email: 'person@example.test', [ORGANIZATIONS_CLAIM]: ORGANIZATIONS, [PERMISSIONS_CLAIM]: SETS,
        }),
      }
    },
    interactions: { policy: makeInteractionPolicy(), url: async (_, interaction) => `${base}/login/${interaction.uid}` },
  })
  server.on('request', provider.callback())

  return { provider, base, loaded }
}

type Running = Awaited<ReturnType<typeof start>>

const makeJar = () => {
  const jar = new Map<string, string>()

  return {
    get: (name: string) => jar.get(name),
    header: () => [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
    remember: (response: Response) => {
      for (const line of response.headers.getSetCookie()) {
        const [pair] = line.split(';')
        const name = pair.slice(0, pair.indexOf('='))
        const value = pair.slice(pair.indexOf('=') + 1)
        if (value === '') jar.delete(name)
        else jar.set(name, value)
      }
    },
  }
}

const basic = (clientId: string) => `Basic ${Buffer.from(`${clientId}:${SECRET}`).toString('base64')}`

const payloadOf = (jwt: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())

/** Sign the account in to `clientId` the way the application's interaction handler does. */
const signIn = async (env: Running, clientId: string, scope: string, jar = makeJar()) => {
  const step = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const response = await fetch(url, { ...init, redirect: 'manual', headers: { ...init.headers, cookie: jar.header() } })
    jar.remember(response)
    return response
  }
  const redirectUri = `https://${clientId}.example.test/callback`

  const asked = await step(`${env.base}/auth?${new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope, prompt: 'consent',
  })}`)
  const location = new URL(asked.headers.get('location') ?? 'about:blank')
  if (location.pathname.startsWith('/login/')) {
    const interaction = await env.provider.Interaction.find(location.pathname.split('/').pop()!)
    const grant = new env.provider.Grant({ accountId: ACCOUNT, clientId })
    grant.addOIDCScope(scope)
    interaction!.result = { login: { accountId: ACCOUNT }, consent: { grantId: await grant.save() } }
    await interaction!.save(600)
    const done = await step(interaction!.returnTo)
    location.href = done.headers.get('location') ?? 'about:blank'
  }
  const code = location.searchParams.get('code')
  expect(code).not.toBeNull()

  const tokens = await fetch(`${env.base}/token`, {
    method: 'POST',
    headers: { authorization: basic(clientId), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: code!, redirect_uri: redirectUri }),
  }).then(r => r.json()) as Record<string, string>

  return { tokens, jar }
}

const userinfo = async (env: Running, accessToken: string) =>
  await fetch(`${env.base}/me`, { headers: { authorization: `Bearer ${accessToken}` } })
    .then(r => r.json()) as Record<string, unknown>

const introspect = async (env: Running, clientId: string, token: string) =>
  await fetch(`${env.base}/token/introspection`, {
    method: 'POST',
    headers: { authorization: basic(clientId), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  }).then(r => r.json()) as Record<string, unknown>

const SCOPE = `openid email offline_access ${PERMISSIONS_SCOPE} ${ORGANIZATIONS_SCOPE}`

describe('pairwise subjects over the pinned oidc-provider', () => {
  it('one subject per client in the id_token, userinfo and introspection', async () => {
    const env = await start()
    const { tokens } = await signIn(env, PREVIEW, SCOPE)
    const subject = profileIdOf(PREVIEW, ACCOUNT)

    expect(subject).not.toBe(ACCOUNT)
    expect(payloadOf(tokens.id_token).sub).toBe(subject)
    expect((await userinfo(env, tokens.access_token)).sub).toBe(subject)
    const introspected = await introspect(env, PREVIEW, tokens.access_token)
    expect(introspected.active).toBe(true)
    expect(introspected.sub).toBe(subject)
  })

  it('keeps the subject across a refresh', async () => {
    const env = await start()
    const { tokens } = await signIn(env, PREVIEW, SCOPE)
    expect(tokens.refresh_token).toBeDefined()

    const refreshed = await fetch(`${env.base}/token`, {
      method: 'POST',
      headers: { authorization: basic(PREVIEW), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
    }).then(r => r.json()) as Record<string, string>

    expect(payloadOf(refreshed.id_token).sub).toBe(profileIdOf(PREVIEW, ACCOUNT))
  })

  it('the session and the account service see the account id, never the subject', async () => {
    const env = await start()
    const { jar } = await signIn(env, PREVIEW, SCOPE)

    const session = await env.provider.Session.find(jar.get('_session')!)
    expect(session?.accountId).toBe(ACCOUNT)
    expect(env.loaded.length).toBeGreaterThan(0)
    expect(new Set(env.loaded)).toEqual(new Set([ACCOUNT]))
  })

  it('another client of the same account gets another subject from the same session', async () => {
    const env = await start()
    const preview = await signIn(env, PREVIEW, SCOPE)
    const production = await signIn(env, PRODUCTION, SCOPE, preview.jar)

    const subject = profileIdOf(PRODUCTION, ACCOUNT)
    expect(payloadOf(production.tokens.id_token).sub).toBe(subject)
    expect(subject).not.toBe(profileIdOf(PREVIEW, ACCOUNT))
    expect((await introspect(env, PRODUCTION, production.tokens.access_token)).sub).toBe(subject)
  })
})

describe('the organizations scope', () => {
  it('carries the organizations claim and the full permission claim when granted', async () => {
    const env = await start()
    const { tokens } = await signIn(env, PREVIEW, SCOPE)
    const claims = payloadOf(tokens.id_token)

    expect(claims[ORGANIZATIONS_CLAIM]).toEqual(ORGANIZATIONS)
    expect(claims[PERMISSIONS_CLAIM]).toEqual(SETS)
    expect((await userinfo(env, tokens.access_token))[ORGANIZATIONS_CLAIM]).toEqual(ORGANIZATIONS)
  })

  it('emits no organizations claim to a client that did not ask for the scope', async () => {
    const env = await start()
    const { tokens } = await signIn(env, PREVIEW, `openid email ${PERMISSIONS_SCOPE}`)
    const claims = payloadOf(tokens.id_token)

    expect(claims[ORGANIZATIONS_CLAIM]).toBeUndefined()
    expect(claims[PERMISSIONS_CLAIM]).toEqual(SETS)
    expect((await userinfo(env, tokens.access_token))[ORGANIZATIONS_CLAIM]).toBeUndefined()
  })
})

describe('client metadata under pairwise-only subjects', () => {
  const providerWith = (metadata: Partial<ClientMetadata>) => new Provider('http://127.0.0.1:1', {
    subjectTypes: ['pairwise'],
    pairwiseIdentifier: async (_ctx, accountId, owner) => profileIdOf(owner.clientId, accountId),
    clients: [{ client_id: PREVIEW, client_secret: SECRET, redirect_uris: ['https://a.example.test/cb'], ...metadata }],
  })

  it('makes pairwise the default subject type', async () => {
    expect((await providerWith({}).Client.find(PREVIEW))?.subjectType).toBe('pairwise')
  })

  it('refuses a client that declares a public subject', async () => {
    const failure = await providerWith({ subject_type: 'public' }).Client.find(PREVIEW).catch((error: unknown) => error)
    expect(String(failure)).toContain('invalid_client_metadata')
  })
})
