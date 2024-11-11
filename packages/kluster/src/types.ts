import type { LazyService } from '@owlmeans/context'
import type { KubeConfig, CoreV1Api, NetworkingV1Api } from '@kubernetes/client-node'
import type { ServerConfig } from '@owlmeans/server-context'

export interface KlusterService extends LazyService {
  config?: KubeConfig
  api?: CoreV1Api

  getHostnames: (selector: string) => Promise<string[]>

  getServiceHostname: (selector: string) => Promise<string>

  dispatch: <T>(action: string, query: string) => Promise<T>

  makeNetworkingApi: () => NetworkingV1Api
}

export interface KlusterConfig extends ServerConfig {
  kluster?: {
    namespace?: string
  }
}
