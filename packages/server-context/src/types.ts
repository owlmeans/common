import type { ServiceRoute } from '@owlmeans/server-route'
import type { BasicConfig, BasicContext } from './utils/types.js'

export interface Config extends BasicConfig {
  services: Record<string, ServiceRoute>
}

export interface ServerContext<C extends BasicConfig> extends BasicContext<C> {
}
