
// Resource registration aliases (used as lookup keys via ctx.resource(...)). These keep
// their historical colon-delimited form for backward compatibility — they are NOT the
// Mongo collection names. The collection names are the colon-free *_COLLECTION values
// below, optionally prefixed via DbConfig.resourcePrefix (see AUTH_IDENTITY_DB_ALIAS).
export const AUTH_IDENTITY_ACCOUNT = 'auth-identity:account'
export const AUTH_IDENTITY_PROFILE = 'auth-identity:profile'
export const AUTH_IDENTITY_CREDENTIALS = 'auth-identity:credentials'
export const AUTH_IDENTITY_LINKING = 'auth-identity:linking'
export const AUTH_IDENTITY_ORG_ENTITY = 'auth-identity:org-entity'

// Colon-free Mongo collection base names. The final collection name is
// `${resourcePrefix}${collection}` — e.g. with the project prefix 'viam-' this yields
// 'viam-account'. Register the identity resources against a db config that carries the
// desired resourcePrefix by passing AUTH_IDENTITY_DB_ALIAS to appendAuthIdentityResources.
export const AUTH_IDENTITY_ACCOUNT_COLLECTION = 'account'
export const AUTH_IDENTITY_PROFILE_COLLECTION = 'profile'
export const AUTH_IDENTITY_CREDENTIALS_COLLECTION = 'credentials'
export const AUTH_IDENTITY_ORG_ENTITY_COLLECTION = 'org-entity'

// Suggested db-config alias for a dedicated config whose resourcePrefix scopes the
// collection prefix to identity collections only (not the whole database).
export const AUTH_IDENTITY_DB_ALIAS = 'auth-identity'

// How many slugs to try before giving up on minting a free one. Collisions are settled against a
// unique index, so this bounds a retry loop rather than a probability.
export const MAX_ENTITY_SLUG_ATTEMPTS = 8

// Helper prefixes for stable key derivation
export const LOGIN_SERVICE_PREFIX = 'service'
export const EXTERNAL_KEY_DELIMITER = ':'
