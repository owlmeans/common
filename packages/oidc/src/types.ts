import type { AuthToken } from '@owlmeans/auth'
import type { AuthorizationService } from '@owlmeans/auth-common'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { GuardService } from '@owlmeans/module'

export interface Config extends BasicConfig { }
export interface Context<C extends Config = Config> extends BasicContext<C> { }

export interface OidcSharedConfig {
  clientCookie?: {
    interaction?: {
      name?: string
      ttl?: number
    }
  },
  providers?: OidcProviderConfig[]
  /**
   * false - in case the service user can't use identity provider for authentication (restricted for internal use only)
   * true - in case only default identity provider can be used
   * string[] - list of allowed identity providers
   */
  restrictedProviders?: boolean | string[]
}

export interface OidcProviderConfig extends OidcProviderDescriptor {
  // Use this flag to allow only internal use 
  internal?: boolean
  // The client id that is used to administrate the underlying IAM service
  apiClientId?: string
}

export interface OidcProviderDescriptor {
  // Bound this client to sepcific organization entity
  entityId?: string
  service?: string
  discoveryUrl?: string
  basePath?: string
  clientId: string
  secret?: string
  extraScopes?: string
  idOverride?: string
  // This flag works only on client side. It specifies a default relying party
  def?: boolean
}


export interface WithSharedConfig {
  oidc: OidcSharedConfig
}

export interface OidcGuard extends GuardService {
}

export interface OidcGuardOptions {
  cache?: string
  coguards: string | string[]
  tokenService?: string
}

export interface OIDCAuthInitParams {
  entity?: string
  profile?: string
}

// @TODO replace arbitarary Record params with specific possible params for OIDC
export interface OIDCClientAuthPayload extends Record<string, string> {
  code: string
  authUrl: string
}

export interface WrappedOIDCService extends AuthorizationService {
}

export interface OIDCTokenUpdate extends AuthToken {
  tokenSet: CommonTokenSetParams
}

export interface CommonTokenSetParams extends Record<string, string | number | undefined> {
  access_token?: string
  token_type?: string
  id_token?: string
  refresh_token?: string
  scope?: string

  expires_at?: number
  session_state?: string
}


export interface ProviderProfileDetails extends Partial<OidcUserDetails> {
  type: string
  service: string
  clientId: string
  userId: string
  profileId?: string
}

export interface OidcUserDetails {
  userId: string
  username: string
  entityId?: string
  did?: string
  // This flag is used to identify OwlMeans ID and OwlMeans IAM user
  // The presence of OlwMeans ID exactly is defined by presence of the did field
  // alongisde this flag set to true
  // In general sence this flag is used to denounce that the authenticated
  // profile belongs to the governining organization.
  // So if the flag is ended up being true - it may also mean that the user
  // is governed by an organization that uses OwlMeans IAM solutions on premises basis.
  // Actually it makes this property untrasferable between different app services.
  isOwlMeansId?: boolean
}

export interface OidcProviderSettings {
  registrationEnabled: boolean
}
