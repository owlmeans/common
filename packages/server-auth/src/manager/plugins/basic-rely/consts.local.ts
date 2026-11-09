/**
 * The only credential fields a rely-handshake token keeps from what the caller posted. Everything
 * else — a profile, an organization (`entitySlug` or `entityId`), permissions, groups, an expiry, a
 * `source` — is dropped, and the identity is pinned to a guest: the handshake proves a tunnel between
 * two parties, never who either of them is.
 */
export const RELY_CREDENTIAL_FIELDS: readonly string[] = Object.freeze([
  'type', 'role', 'userId', 'scopes', 'challenge', 'credential',
])
