import type { AllowanceRequest, AllowanceResponse, AuthCredentials, AuthToken } from '@owlmeans/auth'

export interface AuthModel {
  init: (request: AllowanceRequest) => Promise<AllowanceResponse>

  authenticate: (credential: AuthCredentials) => Promise<AuthToken>
}
