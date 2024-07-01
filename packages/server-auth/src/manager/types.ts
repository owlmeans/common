import type { AllowenceRequest, AllowenceResponse, AuthCredentials, AuthToken } from '@owlmeans/auth'

export interface AuthModel {
  init: (request: AllowenceRequest) => Promise<AllowenceResponse>

  authenticate: (credential: AuthCredentials) => Promise<AuthToken>
}
