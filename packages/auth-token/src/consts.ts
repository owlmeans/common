/** The guard alias a long-lived access token is verified by. */
export const GUARD_AUTH_TOKEN = 'guard:auth-token'

/** The resource alias holding access-token records. */
export const AUTH_TOKEN_RESOURCE = 'auth-token:token'

/** The collection an access-token resource is backed by, where the backend has collections. */
export const AUTH_TOKEN_COLLECTION = 'access-token'

/**
 * The default prefix every issued token carries.
 *
 * The prefix is what makes a token CLAIMABLE: the guard answers `match` only for a value that
 * starts with it, so an access token and a session bearer can share the `Bearer` scheme without
 * either guard shadowing the other. A deployment overrides it with its own — `vib_`, `acme_` — and
 * two deployments then never mistake each other's credentials for their own.
 */
export const AUTH_TOKEN_DEFAULT_PREFIX = 'owl_'

/** Random bytes behind one token. 24 bytes ≈ 192 bits, base58-encoded to 33 characters. */
export const AUTH_TOKEN_SECRET_BYTES = 24

/**
 * How many characters of a token are kept for display.
 *
 * The plaintext is shown once, at creation, and never again — what a list shows is the prefix plus
 * this many characters, which is enough for a person to tell two of their own tokens apart and far
 * too little to use.
 */
export const AUTH_TOKEN_DISPLAY_LENGTH = 8

/**
 * How often a token's `lastUsedAt` is written.
 *
 * Every request would mean a database write per API call for a field nobody reads in real time.
 * Five minutes answers the only question the field exists for — "is this token still in use?" —
 * at a thousandth of the cost.
 */
export const AUTH_TOKEN_TOUCH_INTERVAL = 5 * 60 * 1000

/** The longest lifetime a token may be issued for. */
export const AUTH_TOKEN_MAX_TTL = 366 * 24 * 60 * 60 * 1000

export const AUTH_TOKEN_NAME_MAX = 64

/**
 * The route aliases of the token-management surface.
 *
 * Declared here so a client and a server address the same names, and mounted under whatever parent
 * the application chooses — an account section, a settings section, a dedicated prefix.
 */
export const authToken = Object.freeze({
  base: 'auth-token:base',
  list: 'auth-token:list',
  create: 'auth-token:create',
  revoke: 'auth-token:revoke',
})

/** The `Authorization` schemes a token may arrive under, lower-cased. */
export const AUTH_TOKEN_SCHEME = 'auth-token'
export const BEARER_SCHEME = 'bearer'
