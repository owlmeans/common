import type { OidcSharedConfig } from '@owlmeans/oidc'
import type { OidcAuthState } from './consts.js'
import type { ResourceRecord } from '@owlmeans/resource'

export interface OidcAuthStateModel extends AuthStateProperties {
  init: (uid: string, reset?: boolean) => Promise<OidcAuthStateModel>
  updateAuthState: (uid: string) => Promise<OidcAuthState[]>

  isAuthenticated: () => boolean
  isSameEntity: () => boolean
  isIdLinked: () => boolean
  profileExists: () => boolean
  isRegistrationAllowed: () => boolean

  finishInteraction: (skipState?: boolean) => Promise<void>

  getState: () => OidcAuthState[]
}

export interface AuthStateProperties {
  did?: string
  entitId?: string
  state: Set<OidcAuthState>
  uid: string
}


export interface WithSharedConfig {
  oidc: OidcSharedConfig
}

export interface OidcInteraction extends ResourceRecord {
  stack: {
    token: string | null
    uid: string
  }[]
}
