import type { LazyService } from '@owlmeans/context'
import type { KubeConfig, CoreV1Api, NetworkingV1Api, AppsV1Api } from '@kubernetes/client-node'
import type { ServerConfig } from '@owlmeans/server-context'

export interface KlusterService extends LazyService {
  config?: KubeConfig
  api?: CoreV1Api

  getHostnames: (selector: string, namespace?: string) => Promise<string[]>

  // It should also return the array of cluster ips
  getServiceHostname: (selector: string, namespace?: string) => Promise<string | null>

  dispatch: <T>(action: string, query: string) => Promise<T>

  makeNetworkingApi: () => NetworkingV1Api

  makeAppsApi: () => AppsV1Api
}

export interface KlusterConfig extends ServerConfig {
  kluster?: {
    namespace?: string
  }
}
