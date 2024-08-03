import type { AllowanceRequest, AllowanceResponse, AuthCredentials, AuthToken } from '@owlmeans/auth'
import type { KlusterConfig } from '@owlmeans/kluster'
import type { ApiServerAppend } from '@owlmeans/server-api'
import type { ServerContext, ServerConfig } from '@owlmeans/server-context'
import type { ServiceRoute } from '@owlmeans/server-route'
import type { Connection } from '@owlmeans/socket'

export interface AppConfig extends ServerConfig, KlusterConfig {
  services: Record<string, ServiceRoute>
}

export interface AuthModel {
  init: (request: AllowanceRequest) => Promise<AllowanceResponse>

  authenticate: (credential: AuthCredentials) => Promise<AuthToken>

  rely: (conn: Connection, source?: string | null) => Promise<void>
}

export interface AppContext<C extends AppConfig> extends ServerContext<C>
  , ApiServerAppend { }
