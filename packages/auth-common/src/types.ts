import type { AuthToken } from '@owlmeans/auth'
import type { AbstractRequest } from '@owlmeans/module'

export interface AuthRequest extends AbstractRequest {
  query: AuthToken
}
