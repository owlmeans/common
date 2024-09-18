import type { InitializedService } from '@owlmeans/context'
import type { Client, Issuer } from 'openid-client'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { OidcSharedConfig, WithSharedConfig } from '@owlmeans/oidc'
import type { Profile } from '@owlmeans/auth'

export interface OidcClientService extends InitializedService {
  getIssuer: (clientId?: string) => Promise<Issuer>
  getClient: (clientId?: string | Issuer) => Promise<Client>

  providerApi: () => ProviderApiService | null
  accountLinking: () => AccountLinkingService | null
}

export interface OidcRpConfig extends OidcSharedConfig {
  consumer: OidcSharedConfig['consumer'] & {
    accountLinkingService?: string
    providerApiService?: string
  },
  consumerSecrets?: OidcSharedConfig['consumerSecrets'] & {
    adminSecret?: string
  }
}

export interface Config extends ServerConfig, WithSharedConfig {
  oidc: OidcRpConfig
}

export interface Context<C extends Config = Config> extends ServerContext<C> { }

export interface AccountLinkingService extends InitializedService {
  linkAccount: (details: ProviderAccountDetails) => Promise<Profile>
}

export interface ProviderAccountDetails {
  type: string
  clientId: string
  profileId: string
  entityId: string
}

export interface ProviderApiService extends InitializedService {
  getOrganizationDetails: (token: string, organization: string) => Promise<unknown>
  getUserDetails: (token: string, userId: string) => Promise<OidcUserDetails>
  enrichUser: (token: string, user: OidcUserDetails) => Promise<OidcUserDetails>
}

export interface OidcUserDetails {
  userId: string
  username: string
  entityId?: string
}
