import type { InitializedService } from '@owlmeans/context'
import type { Client, Issuer } from 'openid-client'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { WithSharedConfig } from '@owlmeans/oidc'

export interface OidcClientService extends InitializedService {
  getIssuer: (clientId?: string) => Promise<Issuer>
  getClient: (clientId?: string | Issuer) => Promise<Client>
}

export interface Config extends ServerConfig, WithSharedConfig {
}

export interface Context<C extends Config = Config> extends ServerContext<C> { }
