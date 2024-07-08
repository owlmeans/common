import type { Auth, AuthToken } from '@owlmeans/auth'
import type { GuardService } from '@owlmeans/module'

export interface AuthService extends GuardService {
  auth?: Auth
  token?: string
  /**
   * @throws {AuthenFailed}
   */
  authenticate: (token: AuthToken) => Promise<void>
  authenticated: () => boolean
  user: () => Auth
}

export interface AuthServiceAppend {
  auth: () => AuthService
}
