import type { InitializedService } from '@owlmeans/context'
import { OidcSharedConfig } from '@owlmeans/oidc'
import type { ApiServer, ApiServerAppend } from '@owlmeans/server-api'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { Account, Adapter, ClientMetadata, Configuration, Provider } from 'oidc-provider'

export interface OidcProviderService extends InitializedService {
  oidc: Provider

  update: (api: ApiServer) => Promise<void>

  instance: () => Provider
}

export interface OidcConfigAppend {
  oidc: OidcConfig
}

export interface OidcConfig extends OidcSharedConfig {
  authService?: string
  basePath?: string
  frontBase?: string
  staticClients: ClientMetadata[]
  customConfiguration?: Configuration
  behindProxy?: boolean
  defaultKeys: {
    RS256: {
      pk: string
      pub?: string
    }
  }
  accountService?: string
  adapterService?: string
}

export interface OidcAccountService extends InitializedService {
  loadById: <C extends Config, T extends Context<C>>(ctx: T, id: string) => Promise<Account | undefined>
}

export interface OidcAdapterService extends InitializedService {
  instance: (name: string) => Adapter
}

export interface Config extends ServerConfig, OidcConfigAppend { 
  debug: ServerConfig["debug"] & {
    oidc?: boolean
  }
}

export interface Context<C extends Config = Config> extends ServerContext<C>
  , ApiServerAppend { }
