import type { BasicClientConfig } from '@owlmeans/client-config'
import type { BasicContext } from '@owlmeans/context'
import type { CommonServiceRoute } from '@owlmeans/route'

export interface ClientConfig extends BasicClientConfig {
  services: Record<string, CommonServiceRoute>
}

export interface ClientContext<C extends ClientConfig> extends BasicContext<C> {
  serviceRoute: (alias: string, makeDefault?: boolean) => CommonServiceRoute
}
