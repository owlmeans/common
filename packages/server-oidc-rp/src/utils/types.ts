import type { AuthSpent } from '@owlmeans/server-auth'
import type { OidcTokenSetParameters } from '../types.js'

export interface OIDCAuthCache extends AuthSpent {
  verifier?: string
  payload?: OidcTokenSetParameters
  client?: string
  validated?: Date
  entityId?: string
  redirectUri?: string
}
