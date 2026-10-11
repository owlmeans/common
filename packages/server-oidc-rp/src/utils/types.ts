import type { ResolvedEntity } from '@owlmeans/entrypoint'
import type { OidcOrganizationClaim, OidcPermissionSetClaim } from '@owlmeans/oidc'
import type { AuthSpent } from '@owlmeans/server-auth'
import type { OidcTokenSetParameters } from '../types.js'

export interface OIDCAuthCache extends AuthSpent {
  verifier?: string
  payload?: OidcTokenSetParameters
  client?: string
  validated?: Date
  entityId?: string
  profileId?: string
  /** Absolute expiry; cache refreshes must never slide this session beyond its initial TTL. */
  expiresAt?: number
  redirectUri?: string
  /** Verifier record: the organization the person asked to act in at sign-in. */
  entitySlug?: string
  /**
   * Session record: the `entityKey` of the organization the session acts in. Absent on a session
   * whose provider claims no organizations — that one keeps the pre-tenancy behaviour throughout.
   */
  acting?: string
  /** Session record: the acting organization as the guard attaches it to each request. */
  entity?: ResolvedEntity
  /** Session record: the provider's last `organizations` claim. Server-side only. */
  organizations?: OidcOrganizationClaim[]
  /** Session record: the provider's last permission claim, bound sets included. Server-side only. */
  sets?: OidcPermissionSetClaim[]
}

export interface OrganizationSelector {
  /** The organization a running session acts in. When given it is the only acceptable answer. */
  entityKey?: string
  /** The organization a person asked to act in at sign-in. */
  entitySlug?: string
}
