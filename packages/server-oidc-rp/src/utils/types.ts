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
}
