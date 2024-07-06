import type { AuthToken } from '@owlmeans/auth'
import type { GuardService } from '@owlmeans/module'

export interface AuthService extends GuardService {
  authenticate: (token: AuthToken) => Promise<AuthToken>
}

export interface AuthServiceAppend {
  auth: () => AuthService
}
