import type { ProviderApiService } from '@owlmeans/server-oidc-rp'
import type { User } from './types/user.js'
import type { IdentityProviderLink } from './types/idp.js'

export interface KeycloakApiService extends ProviderApiService {
  createUser: (token: string | RequestParams,  payload: NewUser, idps?: IdentityProviderLink[]) => Promise<User>
  assignClientRoles: (token: string | RequestParams, userId: string, roleMap?: RoleMap) => Promise<void>
}

export interface RoleMap {
  [key: string]: {
    roles?: string[]
    blacklist?: boolean
  }
}

export interface NewUser extends Partial<User> {
  username: string
}

export interface RequestParams {
  realm?: string
  token: string
}
