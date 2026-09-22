import {
  CIMD_FETCH_TIMEOUT_MS, CIMD_MAX_BYTES, CIMD_MAX_CACHE_SEC, CIMD_MIN_CACHE_SEC,
  OAUTH_DCR_CLIENT_TTL_MS, OAUTH_DCR_MAX_REDIRECT_URIS, OAUTH_TOKEN_AUTH_METHOD_NONE
} from '@owlmeans/oauth'
import type { ClientIdMetadataDocument, ClientRegistrationRequest, OAuthClientRecord } from '@owlmeans/oauth'
import { OAuthInvalidClient } from '@owlmeans/oauth'
import { makeMongoResource } from '@owlmeans/mongo-resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import { OAUTH_DCR_COLLECTION, OAUTH_DCR_RESOURCE } from './consts.js'
import { assertPublicHostname } from './ssrf.js'
import type { OAuthDcrClientRecord, OAuthServerContext, OAuthStaticClient } from './types.js'


// --- Static clients (configuration) -------------------------------------------------------------

export const staticClientOf = (context: OAuthServerContext, clientId: string): OAuthClientRecord | null => {
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

// --- Client ID Metadata Documents ---------------------------------------------------------------

interface CachedCimd { document: OAuthClientRecord, expiresAt: number }
const cimdCache = new Map<string, CachedCimd>()

const cacheSecondsFrom = (cacheControl: string | null): number => {
  const match = cacheControl?.match(/max-age=(\d+)/)
  const seconds = match != null ? Number(match[1]) : CIMD_MIN_CACHE_SEC

  return Math.min(Math.max(seconds, CIMD_MIN_CACHE_SEC), CIMD_MAX_CACHE_SEC)
}

const isCimdClientId = (clientId: string): boolean => {
  try {
    const url = new URL(clientId)

    return url.protocol === 'https:' && url.pathname !== '' && url.pathname !== '/'
      && url.hash === '' && url.username === '' && url.password === ''
      && !url.pathname.split('/').some(segment => segment === '.' || segment === '..')
  } catch {
    return false
  }
}

/**
 * Resolve a `client_id` that is itself an HTTPS URL, per the Client ID Metadata Document draft.
 *
 * Fetched, never assumed: the AS reaches out to a URL a party it has no relationship with
 * supplied, so every step here is a mitigation the spec's own security section asks for — no
 * redirects followed, a private/loopback/link-local address refused before the request is even
 * made, a byte ceiling enforced while reading rather than after, and a short deadline so a slow or
 * silent server cannot hold the authorization request open. A failed or invalid fetch is never
 * cached, so a transient problem does not become an outage remembered for the cache lifetime.
 */
export const fetchClientIdMetadataDocument = async (clientId: string): Promise<OAuthClientRecord | null> => {
  if (!isCimdClientId(clientId)) return null

  const cached = cimdCache.get(clientId)
  if (cached != null && cached.expiresAt > Date.now()) return cached.document

  const url = new URL(clientId)
  try {
    await assertPublicHostname(url.hostname)
  } catch {
    // A refused address is exactly as unusable a client_id as an unreachable one — neither is
    // cached, and both answer `null` rather than surfacing a fetch failure to the caller as a
    // different kind of problem than "this client could not be resolved".
    return null
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CIMD_FETCH_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, {
      redirect: 'manual', signal: controller.signal, headers: { accept: 'application/json' },
    })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok || response.body == null) return null

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (; ;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > CIMD_MAX_BYTES) {
      await reader.cancel().catch(() => undefined)

      return null
    }
    chunks.push(value)
  }

  let document: ClientIdMetadataDocument
  try {
    document = JSON.parse(new TextDecoder().decode(concat(chunks))) as ClientIdMetadataDocument
  } catch {
    return null
  }

  if (
    document.client_id !== clientId
    || typeof document.client_name !== 'string' || document.client_name === ''
    || !Array.isArray(document.redirect_uris) || document.redirect_uris.length === 0
    || document.redirect_uris.some(uri => typeof uri !== 'string')
  ) return null

  const record: OAuthClientRecord = {
    clientId,
    clientName: document.client_name,
    clientUri: document.client_uri,
    logoUri: document.logo_uri,
    redirectUris: document.redirect_uris,
    tokenEndpointAuthMethod: OAUTH_TOKEN_AUTH_METHOD_NONE,
    grantTypes: document.grant_types ?? ['authorization_code'],
    responseTypes: document.response_types ?? ['code'],
    origin: 'cimd',
  }

  cimdCache.set(clientId, { document: record, expiresAt: Date.now() + cacheSecondsFrom(response.headers.get('cache-control')) * 1000 })

  return record
}

const concat = (chunks: Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))
  let offset = 0
  chunks.forEach(chunk => { result.set(chunk, offset); offset += chunk.byteLength })

  return result
}

/** Test-only escape hatch: never used by production code, which always calls the real fetch. */
export const forgetCachedClientIdMetadataDocument = (clientId: string): void => { cimdCache.delete(clientId) }

// --- Dynamic Client Registration ------------------------------------------------------------------

export const makeOAuthDcrClientResource = (dbAlias?: string): MongoResource<OAuthDcrClientRecord> => {
  const resource = makeMongoResource<OAuthDcrClientRecord>(OAUTH_DCR_RESOURCE, dbAlias, undefined, OAUTH_DCR_COLLECTION)
  resource.index('client', { clientId: 1 }, { unique: true })
  // A genuine Mongo TTL index: the driver sweeps a record once its own `expiresAt` has passed,
  // so a client that registered and never returned to exchange a code is forgotten without a job.
  resource.index('expiry', { expiresAt: 1 }, { expireAfterSeconds: 0 })

  return resource
}

const dcrResource = (context: OAuthServerContext): MongoResource<OAuthDcrClientRecord> =>
  context.resource<MongoResource<OAuthDcrClientRecord>>(OAUTH_DCR_RESOURCE)

export const dcrClientOf = async (context: OAuthServerContext, clientId: string): Promise<OAuthClientRecord | null> => {
  const record = await dcrResource(context).load({ clientId })
  if (record == null) return null

  // Bumping on use is what keeps an actively-used public client from being swept mid-life —
  // registering is cheap and free, so nothing but activity should extend a client's welcome.
  await dcrResource(context).save({ ...record, lastUsedAt: new Date(), updatedAt: new Date() }).catch(() => undefined)

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

/**
 * RFC 7591, public clients only (`token_endpoint_auth_method: 'none'` — a confidential client
 * has nowhere safe to keep a secret at this layer, since the whole family exists for clients that
 * cannot). A request naming any other auth method, or a symmetric-secret grant, is refused rather
 * than silently narrowed — the caller asked for something this server cannot give it honestly.
 */
export const registerDcrClient = async (
  context: OAuthServerContext, request: ClientRegistrationRequest
): Promise<OAuthDcrClientRecord> => {
  if (request.token_endpoint_auth_method != null && request.token_endpoint_auth_method !== OAUTH_TOKEN_AUTH_METHOD_NONE) {
    throw new OAuthInvalidClient('auth-method')
  }
  const redirectUris = normalizeRedirectUris(request.redirect_uris)

  const clientId = `dcr_${crypto.randomUUID().replace(/-/g, '')}`
  const now = new Date()

  return await dcrResource(context).create({
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

// --- One entry point, trying every source in turn -------------------------------------------------

export const resolveClient = async (
  context: OAuthServerContext, clientId: string
): Promise<OAuthClientRecord | null> => {
  const declared = staticClientOf(context, clientId)
  if (declared != null) return declared

  if (context.cfg.oauth?.allowClientIdMetadataDocuments !== false) {
    const cimd = await fetchClientIdMetadataDocument(clientId)
    if (cimd != null) return cimd
  }

  if (context.hasResource(OAUTH_DCR_RESOURCE)) {
    return await dcrClientOf(context, clientId)
  }

  return null
}
