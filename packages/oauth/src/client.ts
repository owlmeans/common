import { OAuthError } from './errors.js'
import {
  AUTHORIZATION_CODE_GRANT_TYPE, DEVICE_CODE_GRANT_TYPE, OAUTH_AS_METADATA_PATH,
  OAUTH_DEVICE_SLOW_DOWN_STEP_SEC, OAUTH_PRM_PATH_PREFIX
} from './consts.js'
import type {
  AuthorizationServerMetadata, DeviceAuthorizationRequest, DeviceAuthorizationResponse,
  DeviceSignInOutcome, OAuthTokenError, OAuthTokenResponse, OAuthTokenSuccess,
  ProtectedResourceMetadata
} from './types.js'

const isTokenError = (value: OAuthTokenResponse): value is OAuthTokenError => 'error' in value

const form = (fields: Record<string, string | undefined>): URLSearchParams => {
  const body = new URLSearchParams()
  Object.entries(fields).forEach(([key, value]) => { if (value != null) body.set(key, value) })

  return body
}

const asJson = async <T>(response: Response, what: string): Promise<T> => {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new OAuthError(`${what}:malformed`)
  }

  return body as T
}

/**
 * RFC 9728 discovery, from a resource's own origin — what an MCP client does before it knows
 * which authorization server to talk to. `resourcePath` is appended to the well-known prefix
 * exactly as the server side composes it (empty for the root resource).
 */
export const discoverProtectedResource = async (
  resourceOrigin: string, resourcePath: string = ''
): Promise<ProtectedResourceMetadata> => {
  const url = new URL(`${OAUTH_PRM_PATH_PREFIX}${resourcePath}`, resourceOrigin)
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new OAuthError(`resource-metadata:${response.status}`)

  return asJson<ProtectedResourceMetadata>(response, 'resource-metadata')
}

/**
 * RFC 8414 discovery, for an issuer with no path component — the shape this family's own
 * authorization server always has (co-located with the API origin). A caller that already knows
 * the issuer (the platform's own MCP config) skips `discoverProtectedResource` and calls this
 * directly.
 */
export const discoverAuthorizationServer = async (issuer: string): Promise<AuthorizationServerMetadata> => {
  const url = new URL(OAUTH_AS_METADATA_PATH, issuer)
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new OAuthError(`as-metadata:${response.status}`)
  const metadata = await asJson<AuthorizationServerMetadata>(response, 'as-metadata')

  if (metadata.issuer !== issuer.replace(/\/$/, '')) {
    // RFC 8414 §3.3 / MCP authorization spec: a mismatched `issuer` is never used, whatever it
    // contains — the document could have come from anywhere between here and the real server.
    throw new OAuthError('as-metadata:issuer-mismatch')
  }
  if (!metadata.code_challenge_methods_supported?.includes('S256')) {
    throw new OAuthError('as-metadata:no-pkce')
  }

  return metadata
}

export const requestDeviceAuthorization = async (
  server: AuthorizationServerMetadata, body: DeviceAuthorizationRequest
): Promise<DeviceAuthorizationResponse> => {
  const response = await fetch(server.device_authorization_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: form({ ...body }),
  })
  if (!response.ok) throw new OAuthError(`device-authorization:${response.status}`)

  return asJson<DeviceAuthorizationResponse>(response, 'device-authorization')
}

const requestToken = async (
  tokenEndpoint: string, fields: Record<string, string | undefined>
): Promise<OAuthTokenResponse> => {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: form(fields),
  })

  return asJson<OAuthTokenResponse>(response, 'token')
}

export const exchangeAuthorizationCode = async (
  server: AuthorizationServerMetadata,
  req: { code: string, redirectUri: string, clientId: string, codeVerifier: string, resource?: string }
): Promise<OAuthTokenSuccess> => {
  const result = await requestToken(server.token_endpoint, {
    grant_type: AUTHORIZATION_CODE_GRANT_TYPE,
    code: req.code,
    redirect_uri: req.redirectUri,
    client_id: req.clientId,
    code_verifier: req.codeVerifier,
    resource: req.resource,
  })
  if (isTokenError(result)) throw new OAuthError(`code-exchange:${result.error}`)

  return result
}

export interface PollDeviceTokenOptions {
  clientId: string
  deviceCode: string
  /** Seconds, from the device-authorization response. Grows on `slow_down`. */
  interval: number
  expiresAt: number
  signal?: AbortSignal
  /** Called whenever the interval changes, so a caller polling in the background can log it. */
  onInterval?: (seconds: number) => void
  /** Override for tests. Production callers take the RFC 8628 default. */
  slowDownStepSec?: number
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new OAuthError('aborted')) }, { once: true })
})

/**
 * RFC 8628 §3.5: poll until the user acts, the code expires, or the caller aborts.
 *
 * Never throws for a normal outcome — `denied`/`expired`/`aborted` are answers, not exceptions,
 * because a CLI holder reads this in a loop and a thrown error there would need to be caught
 * right back into the same set of outcomes. Only a wire-level fault (a non-JSON body, a network
 * error other than abort) escapes as `OAuthError`.
 */
export const pollDeviceToken = async (
  server: AuthorizationServerMetadata, opts: PollDeviceTokenOptions
): Promise<DeviceSignInOutcome> => {
  // The interval is whatever the device-authorization response said (or its caller's default
  // for a server that omitted the optional field) — never re-clamped here, so a caller can
  // drive this in a test without waiting out a production-scale minimum.
  let interval = opts.interval * 1000

  for (; ;) {
    if (Date.now() >= opts.expiresAt) return { status: 'expired' }
    try {
      await sleep(interval, opts.signal)
    } catch {
      return { status: 'aborted' }
    }
    if (opts.signal?.aborted === true) return { status: 'aborted' }

    let result: OAuthTokenResponse
    try {
      result = await requestToken(server.token_endpoint, {
        grant_type: DEVICE_CODE_GRANT_TYPE,
        device_code: opts.deviceCode,
        client_id: opts.clientId,
      })
    } catch (e) {
      throw e instanceof OAuthError ? e : new OAuthError('device-poll:network')
    }

    if (!isTokenError(result)) return { status: 'authorized', token: result.access_token, expiresIn: result.expires_in }

    switch (result.error) {
      case 'authorization_pending':
        continue
      case 'slow_down':
        interval += (opts.slowDownStepSec ?? OAUTH_DEVICE_SLOW_DOWN_STEP_SEC) * 1000
        opts.onInterval?.(interval / 1000)
        continue
      case 'access_denied':
        return { status: 'denied' }
      case 'expired_token':
        return { status: 'expired' }
      default:
        throw new OAuthError(`device-poll:${result.error}`)
    }
  }
}

export const revokeToken = async (
  server: AuthorizationServerMetadata, req: { token: string, clientId: string }
): Promise<void> => {
  const response = await fetch(server.revocation_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form({ token: req.token, client_id: req.clientId }),
  })
  // RFC 7009 §2.2: the caller cannot tell an unknown token from a revoked one, and must not act
  // as though the request failed either way. Only a wire-level fault is worth surfacing.
  if (!response.ok && response.status !== 400) throw new OAuthError(`revoke:${response.status}`)
}

