import type { InitializedService } from '@owlmeans/context'
import type { AuthorizationCodeGrantChecks, Configuration, IntrospectionResponse, ServerMetadata, TokenEndpointResponse, TokenEndpointResponseHelpers } from 'openid-client'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { OidcProviderConfig, OidcSharedConfig, WithSharedConfig, ProviderProfileDetails, OidcUserDetails, OidcProviderSettings } from '@owlmeans/oidc'
import type { AuthCredentials, AuthPayload, Profile } from '@owlmeans/auth'

export type OidcClientDescriptor = Configuration 
export type TokenSet = TokenEndpointResponse & TokenEndpointResponseHelpers
export type TokenSetParameters = TokenEndpointResponse

export interface OidcClientService extends InitializedService {
  getConfiguration: (clientId: string | Partial<OidcProviderConfig>) => Promise<OidcClientDescriptor>
  getClient: (clientId: string | OidcClientDescriptor | Partial<OidcProviderConfig>) => Promise<OidcClientAdapter>
  getConfig: (clientId: string | Partial<OidcProviderConfig>) => Promise<OidcProviderConfig | undefined>
  getDefault: () => string | undefined

  registerTemporaryProvider: (config: OidcProviderConfig) => OidcProviderConfig
  unregisterTemporaryProvider: (params: Partial<OidcProviderConfig>) => void
  hasProvider: (params: Partial<OidcProviderConfig>) => boolean
  entityToClientId: (params: Partial<OidcProviderConfig>) => string

  providerApi: () => ProviderApiService | null
  accountLinking: () => AccountLinkingService | null
}

export interface OidcClientAdapter {
  getMetadata: () => ServerMetadata
  getClientId: () => string
  getConfig: () => OidcProviderConfig
  makeAuthUrl: (params: Record<string, string>) => string
  grantWithCredentials: () => Promise<TokenSet>
  grantWithCode: (currentUrl: string, checks: AuthorizationCodeGrantChecks, params: Record<string, string>) => Promise<TokenSet>
  refresh: (tokenSet: TokenSetParameters | string) => Promise<TokenSetParameters>
  introspect: (tokenSet: TokenSetParameters, type?: string) => Promise<IntrospectionResponse>
}

export interface OidcRpConfig extends OidcSharedConfig {
  accountLinkingService?: string
  providerApiService?: string
}

export interface Config extends ServerConfig, WithSharedConfig {
  oidc: OidcRpConfig
}

export interface Context<C extends Config = Config> extends ServerContext<C> { }

export interface AccountLinkingService extends InitializedService {
  getLinkedProfile: (details: ProviderProfileDetails) => Promise<AuthPayload | null>
  linkProfile: (details: ProviderProfileDetails, meta: AccountMeta) => Promise<AuthPayload>
  linkCredentials: (details: ProviderProfileDetails) => Promise<AuthPayload>
  getOwnerProfiles: (entityId: string) => Promise<Profile[]>
  getOwnerCredentials: (userId: string, entityId?: string, type?: string) => Promise<AuthCredentials | undefined>
}

export interface AccountMeta {
  username: string
}

export interface ProviderApiService extends InitializedService {
  getUserDetails: (token: string, userId: string) => Promise<OidcUserDetails>
  getSettings: (token: string, realm: string) => Promise<OidcProviderSettings>
}
