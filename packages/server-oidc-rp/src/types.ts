import type { InitializedService } from '@owlmeans/context'
import type { Client, Issuer } from 'openid-client'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { OidcProviderConfig, OidcSharedConfig, WithSharedConfig } from '@owlmeans/oidc'
import type { AuthPayload } from '@owlmeans/auth'

export interface OidcClientService extends InitializedService {
  getIssuer: (clientId: string) => Promise<Issuer>
  getClient: (clientId: string | Issuer) => Promise<Client>
  getConfig: (clientId: string) => Promise<OidcProviderConfig | undefined>
  getDefault: () => string | undefined

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
}

export interface ProviderProfileDetails extends Partial<OidcUserDetails> {
  type: string
  clientId: string
  userId: string
}

export interface AccountMeta {
  username: string
}

export interface ProviderApiService extends InitializedService {
  getUserDetails: (token: string, userId: string) => Promise<OidcUserDetails>
  // @TODO This method is left here to not delete the code that may be required 
  // in the future. It leverages Kc.org attribute to link an organization entity.
  // The problem is that this behaviour is so implementation specific that it's make
  // sense to extract it to OwlMeans Auth propritary implementation.
  getUserDetailsWithOrg: (token: string, userId: string) => Promise<OidcUserDetails>
  enrichUserWithOrg: (token: string, user: OidcUserDetails) => Promise<OidcUserDetails>
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
