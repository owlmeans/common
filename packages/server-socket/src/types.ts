import type { InitializedService } from '@owlmeans/context'
import type { ApiServer } from '@owlmeans/server-api'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

export interface SocketService extends InitializedService {
  update: (api: ApiServer) => Promise<void>
}

export interface ApiServerAppend {
  getApiServer: () => ApiServer
}

export interface Config extends ServerConfig { }

export interface Context<C extends Config = Config> extends ServerContext<C>,
  ApiServerAppend { }
