/**
 * Route aliases of the session-guarded consent surface.
 *
 * These are ordinary entrypoints — mounted under whatever guarded parent the application
 * chooses, an account section usually — because approving or denying a request needs the
 * caller's own session, the same as minting a token by hand does.
 */
export const oauth = Object.freeze({
  base: 'oauth:base',
  load: 'oauth:load',
  approve: 'oauth:approve',
  deny: 'oauth:deny',
  consentScreen: 'oauth:screen:consent',
  deviceScreen: 'oauth:screen:device',
  doneScreen: 'oauth:screen:done',
})

/** Frontend paths of the three screens `@owlmeans/web-oauth` ships. */
export const OAUTH_CONSENT_PATH = '/oauth/consent'
export const OAUTH_DEVICE_PATH = '/oauth/device'
export const OAUTH_DONE_PATH = '/oauth/done'

/**
 * Wire paths of the standards-facing endpoints `@owlmeans/server-oauth` mounts as raw routes.
 *
 * These are never entrypoints: the RFCs fix the wire format (form bodies in, a JSON or a
 * redirect out, error shapes with no envelope), and an entrypoint's schema-driven contract would
 * either reject the protocol or accept anything.
 */
export const OAUTH_AUTHORIZE_PATH = '/oauth/authorize'
export const OAUTH_TOKEN_PATH = '/oauth/token'
export const OAUTH_DEVICE_AUTHORIZATION_PATH = '/oauth/device_authorization'
export const OAUTH_REGISTER_PATH = '/oauth/register'
export const OAUTH_REVOKE_PATH = '/oauth/revoke'

/** RFC 8414 well-known suffix. MCP defines no application-specific one. */
export const OAUTH_AS_METADATA_PATH = '/.well-known/oauth-authorization-server'
/** RFC 9728 well-known prefix. A resource's own path is appended after it. */
export const OAUTH_PRM_PATH_PREFIX = '/.well-known/oauth-protected-resource'

/** RFC 8628 §3.2: the grant type a device-code token request carries. */
export const DEVICE_CODE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
export const AUTHORIZATION_CODE_GRANT_TYPE = 'authorization_code'

/** The one PKCE method this family accepts (OAuth 2.1 §4.1.1, MCP authorization spec). */
export const PKCE_METHOD_S256 = 'S256'

/** RFC 7009: revocation never needs client authentication for a public client. */
export const OAUTH_TOKEN_AUTH_METHOD_NONE = 'none'

/** How long an authorization/device request lives before the user must start over. */
export const OAUTH_REQUEST_TTL_SEC = 600
/** A code exchanged for a token lives far more briefly than the request that produced it. */
export const OAUTH_CODE_TTL_SEC = 60
/** RFC 8628 default and minimum poll interval. */
export const OAUTH_DEVICE_POLL_INTERVAL_SEC = 5
/** How much `slow_down` adds to the interval each time it fires. */
export const OAUTH_DEVICE_SLOW_DOWN_STEP_SEC = 5

/** RFC 8628 §6.1: the alphabet a user_code is drawn from — no 0/O/1/I/vowel confusions. */
export const OAUTH_USER_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'
export const OAUTH_USER_CODE_GROUP_LENGTH = 4
export const OAUTH_USER_CODE_GROUPS = 2
/** `device_code` entropy in bytes before base58 encoding. 192 bits, the same as an access token. */
export const OAUTH_DEVICE_CODE_BYTES = 24

/** How long a Client ID Metadata Document is trusted without being re-fetched. */
export const CIMD_MIN_CACHE_SEC = 5 * 60
export const CIMD_MAX_CACHE_SEC = 24 * 60 * 60
/** RFC-draft §6.6 guidance: a metadata document has no legitimate reason to be large. */
export const CIMD_MAX_BYTES = 5 * 1024
export const CIMD_FETCH_TIMEOUT_MS = 5_000

/** How many redirect URIs a dynamically registered client may declare. */
export const OAUTH_DCR_MAX_REDIRECT_URIS = 10
/** A DCR client record is forgotten if nothing exchanges a code against it for this long. */
export const OAUTH_DCR_CLIENT_TTL_MS = 90 * 24 * 60 * 60 * 1000

/** The default lifetime of a token minted through this flow — see the plan's operator decision. */
export const OAUTH_DEFAULT_TOKEN_TTL_SEC = 90 * 24 * 60 * 60

/** `client_id`/`state`/`resource` length ceilings, generous enough for a CIMD URL. */
export const OAUTH_CLIENT_ID_MAX = 2048
export const OAUTH_STATE_MAX = 1024
export const OAUTH_RESOURCE_MAX = 512
export const OAUTH_SCOPE_MAX = 512
export const OAUTH_REDIRECT_URI_MAX = 2048
export const OAUTH_DEVICE_NAME_MAX = 128
export const OAUTH_CODE_VERIFIER_MIN = 43
export const OAUTH_CODE_VERIFIER_MAX = 128

/** The custom flow name — deliberately short, since it travels inside a URL. */
export const OAUTH_FLOW = '_oauth'
