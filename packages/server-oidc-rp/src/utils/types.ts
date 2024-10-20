import type { AuthSpent } from '@owlmeans/server-auth'
import type { TokenSetParameters } from '../types.js'

export interface OIDCAuthCache extends AuthSpent {
  verifier?: string
  payload?: TokenSetParameters
  client?: string
  validated?: Date
}
