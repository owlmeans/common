import type { InitializedService } from '@owlmeans/context'
import type { ApiServer, ApiServerAppend } from '@owlmeans/server-api'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { ClientMetadata, Configuration } from 'oidc-provider'

export interface OidcProviderService extends InitializedService {
  update: (api: ApiServer) => Promise<void>
}

export interface OidcConfigAppend {
  oidc: OidcConfig
}

export interface OidcConfig {
  authService?: string
  basePath?: string
  staticClients: ClientMetadata[]
  customConfiguration?: Configuration
  behindProxy?: boolean
}

export interface Config extends ServerConfig, OidcConfigAppend { 
  debug: ServerConfig["debug"] & {
    oidc?: boolean
  }
}

export interface Context<C extends Config = Config> extends ServerContext<C>
  , ApiServerAppend { }
