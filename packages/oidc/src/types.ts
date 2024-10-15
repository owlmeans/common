import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { GuardService } from '@owlmeans/module'

export interface Config extends BasicConfig {}
export interface Context<C extends Config = Config> extends BasicContext<C> {}

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

export interface OidcProviderConfig {
  clientId: string
  basePath?: string
  service?: string
  extraScopes?: string
  secret?: string
  // Use this flag to allow only internal use 
  internal?: boolean
  // This flag works only on client side. It specifies a default relying party
  def?: boolean
  // The client id that is used to administrate the underlying IAM service
  apiClientId?: string
  // Bound this client to sepcific organization entity
  entityId?: string
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
}
