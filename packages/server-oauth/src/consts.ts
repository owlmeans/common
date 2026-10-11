/** Service alias of the module, for error locations. */
export const SERVER_OAUTH = 'server-oauth'

/** The resource alias holding every short-lived record this server writes. */
export const OAUTH_PENDING_RESOURCE = 'oauth:pending'

/** The resource alias holding Dynamic Client Registration records. */
export const OAUTH_DCR_RESOURCE = 'oauth:dcr-client'
export const OAUTH_DCR_COLLECTION = 'oauth-dcr-client'


/** Id-namespace prefixes inside `OAUTH_PENDING_RESOURCE` — one resource, several record shapes,
 * distinguished the same way `AUTH_CACHE` distinguishes an OIDC nonce from an OTP code. */
export const PENDING_REQUEST_PREFIX = 'req:'
export const PENDING_CODE_PREFIX = 'code:'
export const PENDING_DEVICE_INDEX_PREFIX = 'dev:'
export const PENDING_USER_CODE_INDEX_PREFIX = 'usr:'
