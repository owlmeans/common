import type { ServiceRoute } from '@owlmeans/route'
import type { BasicConfig, BasicContext } from './utils/types.js'

export interface Config extends BasicConfig {
  services: Record<string, ServiceRoute>
}

export interface ClientContext<C extends BasicConfig> extends BasicContext<C> {
  serviceRoute: (alias: string, makeDefault?: boolean) => ServiceRoute
}
