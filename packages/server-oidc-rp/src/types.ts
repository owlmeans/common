import type { InitializedService } from '@owlmeans/context'
import type { Client, Issuer } from 'openid-client'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { OidcProviderConfig, OidcSharedConfig, WithSharedConfig, ProviderProfileDetails, OidcUserDetails } from '@owlmeans/oidc'
import type { AuthPayload } from '@owlmeans/auth'

export interface OidcClientService extends InitializedService {
  getIssuer: (clientId: string) => Promise<Issuer>
  getClient: (clientId: string | Issuer) => Promise<Client>
  getConfig: (clientId: string) => Promise<OidcProviderConfig | undefined>
  getDefault: () => string | undefined

  registerTemporaryProvider: (config: OidcProviderConfig) => OidcProviderConfig
  unregisterTemporaryProvider: (clientId: string | OidcProviderConfig) => void
  hasProvider: (entityId: string) => boolean
  entityToClientId: (entityId: string) => string

  providerApi: () => ProviderApiService | null
  accountLinking: () => AccountLinkingService | null
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
}

export interface AccountMeta {
  username: string
}

export interface ProviderApiService extends InitializedService {
  getUserDetails: (token: string, userId: string) => Promise<OidcUserDetails>
}
