import type { Auth, AuthToken, PermissionSet, Profile } from '@owlmeans/auth'
import type { ConfigRecord, InitializedService } from '@owlmeans/context'
import type { AbstractRequest, GuardService } from '@owlmeans/module'
import type { Resource, ResourceRecord } from '@owlmeans/resource'

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
  update: (token: string) => Promise<void>
  user: () => Auth
  
  store: <T extends ResourceRecord = ResourceRecord>() => Resource<T>
}

export interface AuthorizationService extends InitializedService {
  isAllowed: (
    permissions: string | string[] | PermissionSet | PermissionSet[], 
    token?: string | AuthToken | null, 
    thr?: boolean
  ) => Promise<boolean>

  update: (token?: string | AuthToken, thr?: boolean) => Promise<AuthToken | null>
}

export interface TrustedRecord extends ConfigRecord, Partial<Omit<Profile, "permissions" | "attributes">> {
  id: string
}
