import type { AuthRole } from '@owlmeans/auth'
import type { ResourceRecord } from '@owlmeans/resource'
import type { EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'

/**
 * One long-lived access token, as stored.
 *
 * The plaintext is never here. What is stored is its hash — a stolen database yields no usable
 * credential — plus `display`, the prefix and a few characters, which is what a person sees in a
 * list. A token is bound to the profile that minted it and can never outrank it: the guard
 * intersects its scopes with the profile's on every request, so revoking a profile's access
 * revokes every token it ever issued without touching a single token record.
 */
export interface AccessTokenRecord extends ResourceRecord {
  id?: string
  /** SHA-256 of the plaintext, hex. The only copy of the secret that exists after issuance. */
  hash: string
  /** Prefix + the first characters of the secret. Shown in lists; useless as a credential. */
  display: string
  /** What the owner called it. */
  name: string
  userId: string
  profileId: string
  entityId: string
  scopes: string[]
  role: AuthRole
  createdAt: Date
  updatedAt?: Date
  /** Written at most once per touch interval — a usage signal, not an access log. */
  lastUsedAt?: Date
  expiresAt?: Date
  /** Set once and never unset. A revoked token is kept so its display name still resolves. */
  revokedAt?: Date
}

/** What a caller may see. The hash never leaves the server. */
export type AccessTokenView = Omit<AccessTokenRecord, 'hash'>

export interface CreateAccessToken {
  name: string
  /** A subset of the caller's own scopes. Defaults to all of them. */
  scopes?: string[]
  /** Lifetime in seconds. Absent means no expiry; clamped to the maximum TTL. */
  expiresIn?: number
}

/** The one moment the plaintext exists outside the caller's own machine. */
export interface IssuedAccessToken {
  token: string
  record: AccessTokenView
}

export interface AccessTokenList {
  items: AccessTokenView[]
}

export interface AccessTokenParams {
  id: string
}

/**
 * How a client presents a token it already holds.
 *
 * `auth-token` is the OwlMeans scheme; `bearer` is what a third-party client — an MCP host reading
 * a URL configuration, a curl script — will send whatever the documentation says. Both are
 * accepted on the way in; a client chooses the one its transport is comfortable with.
 */
export interface TokenCarrierOptions {
  token: string | (() => string | Promise<string>)
  scheme?: 'auth-token' | 'bearer'
}

export interface AuthTokenEntrypointOptions {
  /** The entrypoint the token routes hang under. */
  parent?: string
  /** Path of the token base, relative to the parent. Defaults to `/tokens`. */
  path?: string
  /** The guard the base carries when it has no parent to inherit one from. */
  guard?: string
}

/** The immutable declarations for a token-management surface. */
export interface AuthTokenEntrypoints {
  base: EntrypointProtocol<OpenRequest, OpenValue>
  list: EntrypointProtocol<OpenRequest, AccessTokenList>
  create: EntrypointProtocol<{ body: CreateAccessToken }, IssuedAccessToken>
  revoke: EntrypointProtocol<{ params: AccessTokenParams }, { id: string }>
}
