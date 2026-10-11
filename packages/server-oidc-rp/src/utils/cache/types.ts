import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { Resource } from '@owlmeans/resource'
import type { OIDCAuthCache } from '../types.js'

/** The OIDC records one context keeps in its auth cache: verifiers, exchanges and wrapped sessions. */
export interface OidcCacheHelper {
  /** The auth cache resource the records live in. */
  resource: () => Resource<OIDCAuthCache>
  /** The id of the PKCE verifier record of an authorization request. */
  verifierId: (challenge: string) => string
  /** The id of the record a code exchange hands its token set over in. */
  exchangeId: (exchange: string) => string
  /** The id of the session record behind a wrapped token. */
  managedId: (token: string) => string
  /** The TTL a session record is saved with: what is left of its absolute expiry, never more. */
  sessionTtl: (expiresAt: number | undefined) => number
  /**
   * The session record behind a wrapped token. A missing one is a session that is gone — signed out,
   * expired, evicted — and the caller signs in again; a bare `get` would let the storage refusal
   * escape as "not found".
   */
  sessionRecord: (token: string) => Promise<OIDCAuthCache>
  /** The session record of an authenticated request. @throws {AuthorizationError} without auth */
  sessionOf: (req: AbstractRequest) => Promise<OIDCAuthCache>
}
