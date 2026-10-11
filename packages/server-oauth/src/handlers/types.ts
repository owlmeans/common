import type { DeviceAuthorizationResponse, OAuthTokenError, ClientRegistrationResponse, OAuthTokenResponse } from '@owlmeans/oauth'

export type AuthorizeOutcome =
  // The client or its redirect URI could not be trusted — nothing is redirected to, ever.
  | { kind: 'refused', status: number, message: string }
  // Client and redirect URI check out; everything else wrong is safe to report AT the redirect.
  | { kind: 'redirect', location: string }
  | { kind: 'to-consent', location: string }

export type DeviceAuthorizationOutcome =
  | { status: 200, body: DeviceAuthorizationResponse }
  | { status: 400, body: OAuthTokenError }

export interface RegisterOutcome {
  status: number
  body: ClientRegistrationResponse | { error: string, error_description?: string }
}

export interface TokenOutcome {
  status: number
  body: OAuthTokenResponse
}

/** A form-encoded body, read as plain strings — a token request is never trusted to already be
 * shaped like `OAuthTokenRequest` just because a client claims a `grant_type`. */
export type TokenRequestBody = Record<string, string | undefined>

/** What a token's name is made of — the client, and where it is running. */
export interface MintMeta {
  scope?: string
  clientName?: string
  /** The device name (device grant) or the redirect host (code grant). */
  label?: string
}
