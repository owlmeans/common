import type { Auth, AuthToken, Profile } from '@owlmeans/auth'
import type { ConfigRecord } from '@owlmeans/context'
import type { AbstractRequest, GuardService } from '@owlmeans/module'

export interface AuthRequest extends AbstractRequest {
  query: AuthToken
}

export interface AuthUIParams {
  type?: string
}

export interface AuthService extends GuardService {
  auth?: Auth
  /**
   * @throws {AuthenFailed}
   */
  authenticate: (token: AuthToken) => Promise<void>
  user: () => Auth
}

export interface TrustedRecord extends ConfigRecord, Partial<Omit<Profile, "permissions" | "attributes">> {
  id: string
}
