import { describe, expect, test } from 'bun:test'
import { AppType, createService, makeBasicContext } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import { createStaticResource } from '@owlmeans/static-resource'
import { AUTH_CACHE } from '@owlmeans/server-auth'
import { TRUSTED } from '@owlmeans/config'
import { makeFixtureKeyPair, makeMemoryTrustedResource } from '@owlmeans/test-auth'
import { AuthForbidden, AuthorizationError, AuthenFailed } from '@owlmeans/auth'
import type { Auth, AuthToken } from '@owlmeans/auth'
import { authProtocols, makeEntityScope } from '@owlmeans/auth-common'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { provideResponse } from '@owlmeans/entrypoint'
import type { AbstractRequest, GuardService } from '@owlmeans/entrypoint'
import { bind } from '@owlmeans/server-entrypoint'
import {
  appendOidcGuard, OIDC_GUARD, ORGANIZATION_REFUSAL, ORGANIZATIONS_CLAIM, PERMISSIONS_CLAIM,
} from '@owlmeans/oidc'
import type {
  OidcOrganizationClaim, OidcOrganizationList, OidcPermissionSetClaim, OidcProviderConfig,
} from '@owlmeans/oidc'
import { DEFAULT_ALIAS } from '../src/consts.js'
import { authenticate, init, listOrganizations, switchOrganization } from '../src/actions/index.js'
import { makeOidcWrappingService } from '../src/wrapper.js'
import { oidcCacheOf } from '../src/utils/cache.js'
import type { OIDCAuthCache } from '../src/utils/types.js'
import type {
  Config, Context, OidcClientAdapter, OidcClientService, OidcTokenSet, OidcTokenSetParameters,
} from '../src/types.js'

/**
 * The relying party end to end against a stand-in for the identity provider: the exchange, the
 * session record, the guard that attaches the acting organization, the re-evaluation on every
 * validation and the organization switch. The provider is the one thing not run here — what it
 * answers is whatever `idp.claims` holds at the moment it is asked.
 */

const SERVICE = 'rp-organization-tests'
const CLIENT = 'acme-preview'
const SUBJECT = 'acme-preview:pairwise-subject'
const ISSUER = 'https://iam.example.test/oidc'
const REDIRECT = 'https://app.example.test/dispatcher'

const UNBOUND: OidcPermissionSetClaim = { scope: CLIENT, permissions: { 'report--view': true } }
const IN_ACME: OidcPermissionSetClaim = { scope: CLIENT, permissions: { 'order--edit': true }, entitySlug: 'acme' }
const IN_BETA: OidcPermissionSetClaim = { scope: CLIENT, permissions: { 'order--delete': true }, entitySlug: 'beta' }

const ACME: OidcOrganizationClaim = { entitySlug: 'acme', entityKey: 'acme-key', owner: true, groups: ['admins'], home: true }
const BETA: OidcOrganizationClaim = { entitySlug: 'beta', entityKey: 'beta-key', owner: false, groups: ['staff'], title: 'Beta' }

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
const idToken = (claims: Record<string, unknown>) =>
  `${encode({ alg: 'RS256' })}.${encode({ iss: ISSUER, aud: CLIENT, sub: SUBJECT, ...claims })}.signature`

interface Idp {
  claims: Record<string, unknown>
  userinfoCalls: number
}

const tokenSetOf = (idp: Idp, extra: Partial<OidcTokenSetParameters & { expires_at: number }> = {}): OidcTokenSet => {
  const set = { access_token: 'access', refresh_token: 'refresh', token_type: 'Bearer', id_token: idToken(idp.claims), ...extra }
  return { ...set, claims: () => ({ sub: SUBJECT, ...idp.claims }) }
}

/** The provider's side of the adapter seam, answering from `idp`. */
const makeIdpClientService = (idp: Idp, provider: OidcProviderConfig): OidcClientService => {
  const adapter: OidcClientAdapter = {
    getMetadata: () => ({ issuer: ISSUER, introspection_endpoint: `${ISSUER}/token/introspection` }),
    getClientId: () => CLIENT,
    getConfig: () => provider,
    makeAuthUrl: params => `${ISSUER}/auth?${new URLSearchParams(params)}`,
    grantWithCredentials: async () => { throw new Error('not a client-credentials client') },
    grantWithCode: async () => tokenSetOf(idp),
    refresh: async () => tokenSetOf(idp),
    introspect: async () => ({ active: true, sub: SUBJECT, client_id: CLIENT }),
    userinfo: async (_, expected) => {
      idp.userinfoCalls++
      if (expected !== SUBJECT) throw new Error('subject mismatch')
      return { sub: SUBJECT, ...idp.claims }
    },
  }

  return createService<OidcClientService>(DEFAULT_ALIAS, {
    getConfiguration: async () => { throw new Error('no discovery in this spec') },
    getClient: async () => adapter,
    getConfig: async () => provider,
    getDefault: () => CLIENT,
    registerTemporaryProvider: config => config,
    unregisterTemporaryProvider: () => undefined,
    hasProvider: () => true,
    entityToClientId: () => CLIENT,
    providerApi: () => null,
    accountLinking: () => null,
    findProvider: () => provider,
  })
}

const start = async (opts: { claims: Record<string, unknown>, sessionValidation?: 'required' | 'optional' }) => {
  const provider: OidcProviderConfig = {
    clientId: CLIENT, secret: 'client-secret', discoveryUrl: ISSUER, service: 'iam', entityId: 'acme-owner',
    ...(opts.sessionValidation != null ? { sessionValidation: opts.sessionValidation } : {}),
  }
  const idp: Idp = { claims: opts.claims, userinfoCalls: 0 }
  const key = makeFixtureKeyPair('server-oidc-rp-organization')

  const context = makeBasicContext({
    ready: false, service: SERVICE, type: AppType.Backend,
    services: { dispatcher: { service: 'dispatcher', type: AppType.Frontend, host: 'app.example.test' } },
    oidc: { providers: [provider] },
  } as unknown as Config) as unknown as BasicContext<Config>

  context.registerResource(createStaticResource(AUTH_CACHE, 'rp-organization-cache'))
  context.registerResource(makeMemoryTrustedResource([{
    id: key.exportAddress(), name: SERVICE, credential: key.exportPublic(), secret: key.export(), scopes: ['*'],
  }], TRUSTED))
  context.registerService(makeIdpClientService(idp, provider))
  context.registerService(makeOidcWrappingService())
  context.registerEntrypoint(bind(authProtocols.dispatcher))
  appendOidcGuard(context as never)
  context.configure()
  await context.init()

  return { context: context as unknown as Context, idp }
}

type Env = Awaited<ReturnType<typeof start>>

const requestOf = (extra: Partial<AbstractRequest> = {}): AbstractRequest =>
  ({ alias: 'test', path: '/', params: {}, query: {}, headers: {}, ...extra })

const run = async <T>(handler: typeof authenticate, env: Env, req: AbstractRequest): Promise<T> => {
  const res = provideResponse<T>()
  await handler({ ref: { ctx: env.context } } as never)(req, res as never)
  if (res.error != null) throw res.error
  return res.value as T
}

const authOf = (token: string): Auth => makeEnvelopeModel<Auth>(token.split(' ')[1], EnvelopeKind.Token).message()

/** Signs in through the exchange, as the dispatcher does after the provider redirected back. */
const signIn = async (env: Env, entitySlug?: string): Promise<string> => {
  const challenge = `challenge-${Math.random().toString(36).slice(2)}`
  await oidcCacheOf(env.context).resource().create({
    id: oidcCacheOf(env.context).verifierId(challenge), verifier: 'verifier', client: CLIENT, ...(entitySlug != null ? { entitySlug } : {}),
  })
  const authUrl = `${ISSUER}/auth?${new URLSearchParams({ code_challenge: challenge, redirect_uri: REDIRECT })}`
  const { token } = await run<AuthToken>(authenticate, env, requestOf({ body: { authUrl, code: 'authorization-code-0001' } }))

  return token
}

const recordOf = async (env: Env, token: string): Promise<OIDCAuthCache | null> =>
  oidcCacheOf(env.context).resource().load(oidcCacheOf(env.context).managedId(authOf(token).token))

/** What the HTTP boundary does for a guarded request: the guard, then `attachEntity`. */
const guarded = async (env: Env, token: string) => {
  const req = requestOf({ headers: { authorization: token } })
  const res = provideResponse<Auth>({ header: () => undefined })
  const guard = env.context.service<GuardService>(OIDC_GUARD)
  expect(await guard.handle<boolean>(req, res)).toBe(true)
  req.auth = res.value
  const attached = await makeEntityScope(req).attachEntity(env.context)

  return { req, attached, auth: res.value! }
}

const ORG_CLAIMS = { [ORGANIZATIONS_CLAIM]: [ACME, BETA], [PERMISSIONS_CLAIM]: [UNBOUND, IN_ACME, IN_BETA] }

describe('sign-in of a client without the organizations scope', () => {
  test('is exactly the pre-tenancy session: the descriptor entity, the claim as given, nothing attached', async () => {
    const env = await start({ claims: { [PERMISSIONS_CLAIM]: [UNBOUND] } })
    const token = await signIn(env, 'acme')

    const auth = authOf(token)
    expect(auth.entitySlug).toBe('acme-owner')
    expect(auth.permissions).toEqual([UNBOUND])
    expect(auth.permissioned).toBe(true)
    expect(auth.groups).toBeUndefined()
    expect(auth.userId).toBe(SUBJECT)

    const record = await recordOf(env, token)
    expect(record?.acting).toBeUndefined()
    expect(record?.entity).toBeUndefined()
    expect(record?.organizations).toBeUndefined()
    expect(record?.sets).toBeUndefined()

    const { req, attached } = await guarded(env, token)
    expect(attached).toBeUndefined()
    expect(req.entity).toBeUndefined()
  })

  test('without a permissions claim the token carries no permissions', async () => {
    const env = await start({ claims: {} })
    const auth = authOf(await signIn(env))

    expect(auth.entitySlug).toBe('acme-owner')
    expect(auth.permissions).toBeUndefined()
    expect(auth.permissioned).toBeUndefined()
  })
})

describe('sign-in of a tenanted client', () => {
  test('starts in the requested organization with its groups and its flattened sets', async () => {
    const env = await start({ claims: ORG_CLAIMS })
    const token = await signIn(env, 'beta')

    const auth = authOf(token)
    expect(auth.entitySlug).toBe('beta')
    expect(auth.groups).toEqual(['staff'])
    expect(auth.permissions).toEqual([UNBOUND, { scope: CLIENT, permissions: { 'order--delete': true } }])
    expect(JSON.stringify(auth)).not.toContain('beta-key')

    const record = await recordOf(env, token)
    expect(record?.acting).toBe('beta-key')
    expect(record?.entity).toEqual({ id: 'beta-key', slug: 'beta', iamKey: 'beta-key' })
    expect(record?.organizations).toEqual([ACME, BETA])
    expect(record?.sets).toEqual([UNBOUND, IN_ACME, IN_BETA])
  })

  test('falls back to the home organization when the requested one is not the subject’s', async () => {
    const env = await start({ claims: ORG_CLAIMS })
    expect(authOf(await signIn(env, 'stranger')).entitySlug).toBe('acme')
    expect(authOf(await signIn(env)).entitySlug).toBe('acme')
  })

  test('answers the token alone — the entity behind it never leaves the server', async () => {
    const env = await start({ claims: ORG_CLAIMS })
    const challenge = 'challenge-response-shape'
    await oidcCacheOf(env.context).resource().create({ id: oidcCacheOf(env.context).verifierId(challenge), verifier: 'verifier', client: CLIENT })
    const authUrl = `${ISSUER}/auth?${new URLSearchParams({ code_challenge: challenge, redirect_uri: REDIRECT })}`
    const response = await run<Record<string, unknown>>(authenticate, env, requestOf({ body: { authUrl, code: 'authorization-code-0002' } }))

    expect(Object.keys(response)).toEqual(['token'])
  })

  test('refuses a subject the provider places in no organization', async () => {
    const env = await start({ claims: { [ORGANIZATIONS_CLAIM]: [], [PERMISSIONS_CLAIM]: [] } })
    await expect(signIn(env)).rejects.toBeInstanceOf(AuthenFailed)
  })

  test('the guard attaches the acting organization and attachEntity keeps it', async () => {
    const env = await start({ claims: ORG_CLAIMS })
    const { req, attached, auth } = await guarded(env, await signIn(env, 'beta'))

    expect(auth.entitySlug).toBe('beta')
    expect(attached).toEqual({ id: 'beta-key', slug: 'beta', iamKey: 'beta-key' })
    expect(req.entity).toEqual(attached)
  })
})

describe('init', () => {
  test('remembers the requested organization in the verifier record', async () => {
    const env = await start({ claims: ORG_CLAIMS })
    const url = await run<string>(init, env, requestOf({ body: { entity: CLIENT, entitySlug: 'beta' } }))
    const challenge = new URL(url).searchParams.get('code_challenge')!

    const verification = await oidcCacheOf(env.context).resource().load(oidcCacheOf(env.context).verifierId(challenge))
    expect(verification?.entitySlug).toBe('beta')
    expect(verification?.client).toBe(CLIENT)
  })
})

describe('every validation re-reads the organizations', () => {
  test('a renamed acting organization renames the session', async () => {
    const env = await start({ claims: ORG_CLAIMS, sessionValidation: 'required' })
    const token = await signIn(env, 'beta')

    env.idp.claims = {
      [ORGANIZATIONS_CLAIM]: [ACME, { ...BETA, entitySlug: 'beta-renamed' }],
      [PERMISSIONS_CLAIM]: [UNBOUND, { ...IN_BETA, entitySlug: 'beta-renamed' }],
    }
    const { auth, attached } = await guarded(env, token)

    expect(env.idp.userinfoCalls).toBeGreaterThan(0)
    expect(auth.entitySlug).toBe('beta-renamed')
    expect(auth.permissions).toEqual([UNBOUND, { scope: CLIENT, permissions: { 'order--delete': true } }])
    expect(attached).toEqual({ id: 'beta-key', slug: 'beta-renamed', iamKey: 'beta-key' })
  })

  test('a subject removed from the acting organization loses the session, not just the organization', async () => {
    const env = await start({ claims: ORG_CLAIMS, sessionValidation: 'required' })
    const token = await signIn(env, 'beta')

    env.idp.claims = { [ORGANIZATIONS_CLAIM]: [ACME], [PERMISSIONS_CLAIM]: [UNBOUND, IN_ACME] }
    const guard = env.context.service<GuardService>(OIDC_GUARD)
    const failure = await Promise.resolve(guard.handle<boolean>(
      requestOf({ headers: { authorization: token } }), provideResponse<Auth>({ header: () => undefined }),
    )).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AuthorizationError)
    expect((failure as Error).message).toContain('entity')
    expect(await recordOf(env, token)).toBeNull()
  })

  test('a refreshed id_token brings the new grants of the acting organization', async () => {
    const env = await start({ claims: ORG_CLAIMS })
    const token = await signIn(env, 'acme')

    // The access token has expired and the record is past its freshness window: the next request
    // refreshes the token set.
    const record = (await recordOf(env, token))!
    record.validated = new Date(0)
    record.payload = { ...record.payload, expires_at: 1 } as OidcTokenSetParameters
    await oidcCacheOf(env.context).resource().save(record)
    env.idp.claims = {
      [ORGANIZATIONS_CLAIM]: [ACME, BETA],
      [PERMISSIONS_CLAIM]: [UNBOUND, { ...IN_ACME, permissions: { 'order--archive': true } }],
    }

    const { auth } = await guarded(env, token)
    expect(auth.entitySlug).toBe('acme')
    expect(auth.permissions).toEqual([UNBOUND, { scope: CLIENT, permissions: { 'order--archive': true } }])
  })
})

describe('the organization switch', () => {
  test('lists the subject organizations, the acting one marked, no key anywhere', async () => {
    const env = await start({ claims: ORG_CLAIMS })
    const { auth } = await guarded(env, await signIn(env))
    const list = await run<OidcOrganizationList>(listOrganizations, env, requestOf({ auth }))

    expect(list).toEqual({
      items: [
        { entitySlug: 'acme', owner: true, groups: ['admins'], home: true, acting: true },
        { entitySlug: 'beta', title: 'Beta', owner: false, groups: ['staff'], acting: false },
      ],
    })
    expect(JSON.stringify(list)).not.toContain('-key')
  })

  test('moves the session into another organization of the subject', async () => {
    const env = await start({ claims: ORG_CLAIMS })
    const { auth } = await guarded(env, await signIn(env))
    const { token } = await run<AuthToken>(switchOrganization, env, requestOf({ auth, body: { entitySlug: 'beta' } }))

    const switched = authOf(token)
    expect(switched.entitySlug).toBe('beta')
    expect(switched.groups).toEqual(['staff'])
    expect(switched.permissions).toEqual([UNBOUND, { scope: CLIENT, permissions: { 'order--delete': true } }])
    expect((await recordOf(env, token))?.acting).toBe('beta-key')

    const next = await guarded(env, token)
    expect(next.attached).toEqual({ id: 'beta-key', slug: 'beta', iamKey: 'beta-key' })
    const list = await run<OidcOrganizationList>(listOrganizations, env, requestOf({ auth: next.auth }))
    expect(list.items.find(item => item.acting)?.entitySlug).toBe('beta')
  })

  test('refuses an organization the subject does not belong to', async () => {
    const env = await start({ claims: ORG_CLAIMS })
    const { auth } = await guarded(env, await signIn(env))
    const failure = await run(switchOrganization, env, requestOf({ auth, body: { entitySlug: 'stranger' } }))
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AuthForbidden)
    expect((failure as Error).message).toContain(ORGANIZATION_REFUSAL)
  })

  test('a pre-tenancy session has nothing to list and nothing to switch to', async () => {
    const env = await start({ claims: { [PERMISSIONS_CLAIM]: [UNBOUND] } })
    const { auth } = await guarded(env, await signIn(env))

    expect(await run<OidcOrganizationList>(listOrganizations, env, requestOf({ auth }))).toEqual({ items: [] })
    const failure = await run(switchOrganization, env, requestOf({ auth, body: { entitySlug: 'acme-owner' } }))
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(AuthForbidden)
  })
})
