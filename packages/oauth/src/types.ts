import type { EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import type { RouteParent } from '@owlmeans/route'

/** Where a client record came from — what the consent screen tells the person signing in. */
export type OAuthClientOrigin = 'static' | 'cimd' | 'dcr'

/**
 * A client this authorization server knows about, whichever way it learned of it.
 *
 * A static client is declared in configuration (`viable-mcp` itself). A CIMD client is resolved
 * on demand from its own `client_id` URL and cached. A DCR client is one that called
 * `/oauth/register` and is stored with an expiry, because nothing vouches for it beyond having
 * asked first.
 */
export interface OAuthClientRecord {
  clientId: string
  clientName: string
  clientUri?: string
  logoUri?: string
  redirectUris: string[]
  tokenEndpointAuthMethod: 'none'
  grantTypes: string[]
  responseTypes: string[]
  scope?: string
  origin: OAuthClientOrigin
}

/** A DCR-registered client, stored with the housekeeping fields a static/CIMD client has no use for. */
export interface OAuthDcrClientRecord extends OAuthClientRecord {
  id?: string
  createdAt: Date
  updatedAt?: Date
  lastUsedAt?: Date
  /** Cleared out if nothing exchanges a code against this client for a long time. */
  expiresAt: Date
}

// --- RFC 9728 protected resource metadata --------------------------------------------------

export interface ProtectedResourceMetadata {
  resource: string
  authorization_servers: string[]
  scopes_supported?: string[]
  bearer_methods_supported?: string[]
}

/** One resource this authorization server issues tokens for. */
export interface OAuthResourceConfig {
  /** The canonical resource URI (RFC 8707 §2), e.g. the API origin or `<api origin>/mcp`. */
  resource: string
  /** Path this resource's metadata is served under, appended to `OAUTH_PRM_PATH_PREFIX` — empty
   * (or omitted) for the root resource, `/mcp`-shaped otherwise. Written WITH the leading slash in
   * the options, but `appendOAuthServer` stores it without one: the server config reader would
   * otherwise replace a leaf that starts with `/` by the contents of that file. */
  path?: string
  scopes?: string[]
  /** Client ids admitted for this resource. Absent means every known client. */
  clients?: string[]
}

// --- RFC 8414 authorization server metadata -------------------------------------------------

export interface AuthorizationServerMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  device_authorization_endpoint: string
  revocation_endpoint: string
  registration_endpoint?: string
  scopes_supported: string[]
  response_types_supported: string[]
  grant_types_supported: string[]
  code_challenge_methods_supported: string[]
  token_endpoint_auth_methods_supported: string[]
  client_id_metadata_document_supported: boolean
  authorization_response_iss_parameter_supported: boolean
}

// --- RFC 8628 device authorization grant ----------------------------------------------------

export interface DeviceAuthorizationRequest {
  client_id: string
  scope?: string
  resource?: string
  /** Non-standard extension: what the token list should call this credential. */
  device_name?: string
}

export interface DeviceAuthorizationResponse {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  expires_in: number
  interval: number
}

// --- Token endpoint --------------------------------------------------------------------------

export interface AuthorizationCodeTokenRequest {
  grant_type: 'authorization_code'
  code: string
  redirect_uri: string
  client_id: string
  code_verifier: string
  resource?: string
}

export interface DeviceCodeTokenRequest {
  grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
  device_code: string
  client_id: string
}

export type OAuthTokenRequest = AuthorizationCodeTokenRequest | DeviceCodeTokenRequest

export interface OAuthTokenSuccess {
  access_token: string
  token_type: 'Bearer'
  expires_in?: number
  scope?: string
}

/** RFC 6749 §5.2 plus RFC 8628 §3.5's device-specific values. */
export type OAuthTokenErrorCode =
  | 'invalid_request' | 'invalid_client' | 'invalid_grant' | 'unauthorized_client'
  | 'unsupported_grant_type' | 'invalid_scope' | 'invalid_target'
  | 'authorization_pending' | 'slow_down' | 'access_denied' | 'expired_token'

export interface OAuthTokenError {
  error: OAuthTokenErrorCode
  error_description?: string
}

export type OAuthTokenResponse = OAuthTokenSuccess | OAuthTokenError

// --- Authorization endpoint (code grant) -----------------------------------------------------

export interface AuthorizeQuery {
  response_type: 'code'
  client_id: string
  redirect_uri: string
  scope?: string
  state?: string
  code_challenge: string
  code_challenge_method: 'S256'
  resource?: string
}

// --- Dynamic Client Registration (RFC 7591, public clients only) -----------------------------

export interface ClientRegistrationRequest {
  client_name?: string
  client_uri?: string
  logo_uri?: string
  redirect_uris: string[]
  grant_types?: string[]
  response_types?: string[]
  token_endpoint_auth_method?: 'none'
  application_type?: 'web' | 'native'
}

export interface ClientRegistrationResponse {
  client_id: string
  client_id_issued_at: number
  client_name?: string
  client_uri?: string
  logo_uri?: string
  redirect_uris: string[]
  grant_types: string[]
  response_types: string[]
  token_endpoint_auth_method: 'none'
}

// --- Client ID Metadata Documents -------------------------------------------------------------

export interface ClientIdMetadataDocument {
  client_id: string
  client_name: string
  client_uri?: string
  logo_uri?: string
  redirect_uris: string[]
  grant_types?: string[]
  response_types?: string[]
  token_endpoint_auth_method?: string
}

// --- Revocation (RFC 7009) --------------------------------------------------------------------

export interface RevokeTokenRequest {
  token: string
  client_id: string
}

// --- The consent surface, an ordinary guarded entrypoint tree ----------------------------------

export type OAuthRequestKind = 'code' | 'device'

export interface ConsentParams {
  ref: string
}

/** What the screen shows. Nothing here is a secret — the code and the request id are single-use. */
export interface ConsentView {
  ref: string
  kind: OAuthRequestKind
  client: {
    name: string
    origin: OAuthClientOrigin
    /** The `client_id` URL's host, for a CIMD client — shown so a person can judge who is asking. */
    host?: string
  }
  /** The redirect target's host, code grant only. */
  redirectHost?: string
  /** Set when every redirect URI on file is a loopback address — CIMD cannot rule out impersonation. */
  localhostOnly?: boolean
  userCode?: string
  deviceName?: string
  resource?: string
  scopes: string[]
  expiresAt: string
}

export interface ConsentDecisionResult {
  /** Code grant: where to send the browser next. Device grant: absent — the poller catches up. */
  redirect?: string
}

export interface AuthTokenEntrypointOptionsLike {
  parent?: RouteParent
  path?: string
  guard?: string
}

export interface OAuthEntrypoints {
  base: EntrypointProtocol<OpenRequest, OpenValue>
  load: EntrypointProtocol<{ params: ConsentParams }, ConsentView>
  approve: EntrypointProtocol<{ params: ConsentParams }, ConsentDecisionResult>
  deny: EntrypointProtocol<{ params: ConsentParams }, ConsentDecisionResult>
  consentScreen: EntrypointProtocol<OpenRequest, OpenValue>
  deviceScreen: EntrypointProtocol<OpenRequest, OpenValue>
  doneScreen: EntrypointProtocol<OpenRequest, OpenValue>
}

export interface OAuthEntrypointOptions extends AuthTokenEntrypointOptionsLike {}

// --- The client-side polling contract ----------------------------------------------------------

export interface PendingDeviceAuthorization {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
  expiresAt: number
  interval: number
}

export type DeviceSignInOutcome =
  | { status: 'authorized', token: string, expiresIn?: number }
  | { status: 'denied' }
  | { status: 'expired' }
  | { status: 'aborted' }
