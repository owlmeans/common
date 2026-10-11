import { memoHelper } from '@owlmeans/context'
import { OAUTH_DCR_CLIENT_TTL_MS, OAUTH_DCR_MAX_REDIRECT_URIS, OAUTH_TOKEN_AUTH_METHOD_NONE, type ClientRegistrationRequest, type OAuthClientRecord, OAuthInvalidClient } from '@owlmeans/oauth'
import type { MongoResource } from '@owlmeans/mongo-resource'
import { cimdHelper } from './cimd.js'
import { OAUTH_DCR_RESOURCE } from './consts.js'
import type { OAuthDcrClientRecord, OAuthServerContext, OAuthStaticClient } from './types.js'
import type { OAuthClientsHelper } from './clients/types.js'

export const makeOAuthClientsHelper = (context: OAuthServerContext): OAuthClientsHelper => {
  // --- Static clients (configuration) -----------------------------------------------------------

  const staticClientOf = (clientId: string): OAuthClientRecord | null => {
    const declared = context.cfg.oauth?.clients?.find(client => client.clientId === clientId)
    if (declared == null) return null

    return toRecord(declared)
  }

  const toRecord = (client: OAuthStaticClient): OAuthClientRecord => ({
    clientId: client.clientId,
    clientName: client.clientName,
    clientUri: client.clientUri,
    logoUri: client.logoUri,
    redirectUris: client.redirectUris,
    tokenEndpointAuthMethod: OAUTH_TOKEN_AUTH_METHOD_NONE,
    grantTypes: ['authorization_code', 'urn:ietf:params:oauth:grant-type:device_code'],
    responseTypes: ['code'],
    scope: client.scope,
    origin: 'static',
  })

  // --- Dynamic Client Registration --------------------------------------------------------------

  const dcrResource = (): MongoResource<OAuthDcrClientRecord> =>
    context.resource<MongoResource<OAuthDcrClientRecord>>(OAUTH_DCR_RESOURCE)

  const dcrClientOf = async (clientId: string): Promise<OAuthClientRecord | null> => {
    const record = await dcrResource().load({ clientId })
    if (record == null) return null

    // Bumping on use is what keeps an actively-used public client from being swept mid-life —
    // registering is cheap and free, so nothing but activity should extend a client's welcome.
    await dcrResource().save({ ...record, lastUsedAt: new Date(), updatedAt: new Date() }).catch(() => undefined)

    return record
  }

  const normalizeRedirectUris = (uris: string[]): string[] => {
    if (uris.length === 0 || uris.length > OAUTH_DCR_MAX_REDIRECT_URIS) {
      throw new OAuthInvalidClient('redirect-uris:count')
    }

    return uris.map(uri => {
      let parsed: URL
      try {
        parsed = new URL(uri)
      } catch {
        throw new OAuthInvalidClient('redirect-uris:malformed')
      }
      if (parsed.hash !== '') throw new OAuthInvalidClient('redirect-uris:fragment')
      const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1'
      if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
        throw new OAuthInvalidClient('redirect-uris:scheme')
      }

      return uri
    })
  }

  const registerDcrClient = async (request: ClientRegistrationRequest): Promise<OAuthDcrClientRecord> => {
    if (request.token_endpoint_auth_method != null && request.token_endpoint_auth_method !== OAUTH_TOKEN_AUTH_METHOD_NONE) {
      throw new OAuthInvalidClient('auth-method')
    }
    const redirectUris = normalizeRedirectUris(request.redirect_uris)

    const clientId = `dcr_${crypto.randomUUID().replace(/-/g, '')}`
    const now = new Date()

    return await dcrResource().create({
      clientId,
      clientName: request.client_name ?? clientId,
      clientUri: request.client_uri,
      logoUri: request.logo_uri,
      redirectUris,
      tokenEndpointAuthMethod: OAUTH_TOKEN_AUTH_METHOD_NONE,
      grantTypes: request.grant_types ?? ['authorization_code'],
      responseTypes: request.response_types ?? ['code'],
      origin: 'dcr',
      createdAt: now,
      expiresAt: new Date(now.getTime() + OAUTH_DCR_CLIENT_TTL_MS),
    } as OAuthDcrClientRecord)
  }

  // --- One entry point, trying every source in turn ---------------------------------------------

  const resolveClient = async (clientId: string): Promise<OAuthClientRecord | null> => {
    const declared = staticClientOf(clientId)
    if (declared != null) return declared

    if (context.cfg.oauth?.allowClientIdMetadataDocuments !== false) {
      const cimd = await cimdHelper.fetchClientIdMetadataDocument(clientId)
      if (cimd != null) return cimd
    }

    if (context.hasResource(OAUTH_DCR_RESOURCE)) {
      return await dcrClientOf(clientId)
    }

    return null
  }

  return { staticClientOf, dcrClientOf, registerDcrClient, resolveClient }
}

/** The client resolver of a context — one per context. */
export const oauthClientsOf = memoHelper.oncePer(makeOAuthClientsHelper)
