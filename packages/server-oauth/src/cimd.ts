import { CIMD_FETCH_TIMEOUT_MS, CIMD_MAX_BYTES, CIMD_MAX_CACHE_SEC, CIMD_MIN_CACHE_SEC, OAUTH_TOKEN_AUTH_METHOD_NONE, type ClientIdMetadataDocument, type OAuthClientRecord } from '@owlmeans/oauth'
import { ssrfHelper } from './ssrf.js'
import type { CimdHelper } from './cimd/types.js'
import type { CachedCimd } from './types.local.js'

// Process-wide: every resolver in the process shares what one of them already fetched.
const cimdCache = new Map<string, CachedCimd>()

export const createCimdHelper = (): CimdHelper => {
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

  const fetchClientIdMetadataDocument = async (clientId: string): Promise<OAuthClientRecord | null> => {
    if (!isCimdClientId(clientId)) return null

    const cached = cimdCache.get(clientId)
    if (cached != null && cached.expiresAt > Date.now()) return cached.document

    const url = new URL(clientId)
    try {
      await ssrfHelper.assertPublicHostname(url.hostname)
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

  const forgetCachedClientIdMetadataDocument = (clientId: string): void => { cimdCache.delete(clientId) }

  return { fetchClientIdMetadataDocument, forgetCachedClientIdMetadataDocument }
}

export const cimdHelper = createCimdHelper()
