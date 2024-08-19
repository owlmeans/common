import type { Auth, AuthToken } from '@owlmeans/auth'
import type { ClientResource } from '@owlmeans/client-resource'
import type { GuardService } from '@owlmeans/module'
import type { ResourceRecord } from '@owlmeans/resource'

export interface AuthService extends GuardService {
  auth?: Auth
  token?: string
  /**
   * @throws {AuthenFailed}
   */
  authenticate: (token: AuthToken) => Promise<void>
  authenticated: () => Promise<boolean>
  user: () => Auth
}

export interface AuthServiceAppend {
  auth: () => AuthService
}

export interface ClientAuthRecord extends ResourceRecord {
  token: string
  profileId?: string
}

export interface ClientAuthResource extends ClientResource<ClientAuthRecord> {
}
