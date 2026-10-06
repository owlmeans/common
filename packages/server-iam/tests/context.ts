import { AppType, createService, makeBasicContext } from '@owlmeans/context'
import type { BasicContext } from '@owlmeans/context'
import { createStaticResource } from '@owlmeans/static-resource'
import type { Resource } from '@owlmeans/resource'
import { AUTH_CACHE } from '@owlmeans/server-auth'
import { AuthRole } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { OidcOrganizationClaim, OidcPermissionSetClaim, OidcProviderConfig } from '@owlmeans/oidc'
import { DEFAULT_ALIAS, OIDC_TOKEN_STORE } from '@owlmeans/server-oidc-rp'
import type {
  Config, Context, OIDCAuthCache, OidcClientAdapter, OidcClientService, OidcServerMetadata,
} from '@owlmeans/server-oidc-rp'

export const CLIENT = 'acme-preview'
export const ISSUER = 'https://iam.example.test/oidc'
export const ACCESS_TOKEN = 'provider-access-token'

export const ACME: OidcOrganizationClaim = { entitySlug: 'acme', entityKey: 'acme-key', owner: true, home: true, groups: ['admins'] }
export const BETA: OidcOrganizationClaim = { entitySlug: 'beta', entityKey: 'beta-key', owner: false, title: 'Beta' }
export const SETS: OidcPermissionSetClaim[] = [{ scope: CLIENT, permissions: { 'order--edit': true }, entitySlug: 'acme' }]

export interface Provider {
  /** What discovery answers; mutable so a spec can take the runtime field away. */
  metadata: Record<string, unknown>
  getClientCalls: number
}

/** The relying party's view of the provider: discovery metadata, nothing else is reached. */
const makeProviderClientService = (provider: Provider, config: OidcProviderConfig): OidcClientService => {
  const adapter: OidcClientAdapter = {
    getMetadata: () => ({ issuer: ISSUER, ...provider.metadata }) as OidcServerMetadata,
    getClientId: () => CLIENT,
    getConfig: () => config,
    makeAuthUrl: () => { throw new Error('no authorization in this spec') },
    grantWithCredentials: async () => { throw new Error('no grant in this spec') },
    grantWithCode: async () => { throw new Error('no grant in this spec') },
    refresh: async () => { throw new Error('no refresh in this spec') },
    introspect: async () => { throw new Error('no introspection in this spec') },
    userinfo: async () => { throw new Error('no userinfo in this spec') },
  }

  return createService<OidcClientService>(DEFAULT_ALIAS, {
    getConfiguration: async () => { throw new Error('no discovery in this spec') },
    getClient: async () => {
      provider.getClientCalls++
      return adapter
    },
    getConfig: async () => config,
    getDefault: () => CLIENT,
    registerTemporaryProvider: cfg => cfg,
    unregisterTemporaryProvider: () => undefined,
    hasProvider: () => true,
    entityToClientId: () => CLIENT,
    providerApi: () => null,
    accountLinking: () => null,
    findProvider: () => config,
  })
}

export const start = async (metadata: Record<string, unknown> = {}) => {
  const config: OidcProviderConfig = { clientId: CLIENT, secret: 'client-secret', discoveryUrl: ISSUER }
  const provider: Provider = { metadata, getClientCalls: 0 }

  const context = makeBasicContext({
    ready: false, service: 'server-iam-session-tests', type: AppType.Backend, oidc: { providers: [config] },
  } as unknown as Config) as unknown as BasicContext<Config>
  context.registerResource(createStaticResource(AUTH_CACHE, 'server-iam-session-cache'))
  context.registerService(makeProviderClientService(provider, config))
  context.configure()
  await context.init()

  return { context: context as unknown as Context, provider }
}

/** Seeds the `:token:` record a signed-in session of a tenanted client has, as the relying party writes it. */
export const seedSession = async (context: Context, token: string, record: Partial<OIDCAuthCache> = {}) => {
  await context.resource<Resource<OIDCAuthCache>>(AUTH_CACHE).save({
    id: `${OIDC_TOKEN_STORE}:token:${token}`,
    client: CLIENT,
    payload: { access_token: ACCESS_TOKEN, token_type: 'Bearer' },
    acting: ACME.entityKey,
    entity: { id: ACME.entityKey, slug: ACME.entitySlug, iamKey: ACME.entityKey },
    organizations: [ACME, BETA],
    sets: SETS,
    ...record,
  } as OIDCAuthCache)
}

export const requestOf = (token?: string): AbstractRequest => ({
  alias: 'test', path: '/', params: {}, query: {}, headers: {},
  ...(token != null
    ? {
      auth: {
        type: 'oidc-wrapped-token', token, userId: 'acme-preview:subject', role: AuthRole.User,
        scopes: [], entitySlug: ACME.entitySlug, isUser: true, createdAt: new Date(),
      } satisfies Auth,
    }
    : {}),
}) as unknown as AbstractRequest
