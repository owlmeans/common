import type { AuthSpent } from '@owlmeans/server-auth'
import type { TokenSet } from 'openid-client'

export interface OIDCAuthCache extends AuthSpent {
  verifier?: string
  payload?: TokenSet
}
