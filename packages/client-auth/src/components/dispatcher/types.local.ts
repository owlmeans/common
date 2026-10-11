import type { AuthToken } from '@owlmeans/auth'
import type { AbstractRequest } from '@owlmeans/entrypoint'

export interface StateToken {
  token: AuthToken
  query?: AbstractRequest['params']
}
