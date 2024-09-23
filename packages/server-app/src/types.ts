import type { ServerContext, ServerConfig } from '@owlmeans/server-context'
import type { AuthServiceAppend } from '@owlmeans/server-auth'
import type { KlusterConfig } from '@owlmeans/kluster'
import type { ServiceRoute } from '@owlmeans/server-route'
import type { ApiServerAppend } from '@owlmeans/server-api'

export interface AppConfig extends ServerConfig, KlusterConfig {
  services: Record<string, ServiceRoute>
}

export interface AppContext<C extends AppConfig = AppConfig> extends ServerContext<C>,
  AuthServiceAppend,
  ApiServerAppend { }
