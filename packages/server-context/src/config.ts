import { AppType, makeConfig as makeBasicConfig } from '@owlmeans/context'
import { makeConfig as makeBasicClientConfig } from '@owlmeans/client-config'
import type { Config } from './types.js'
import type { ServiceRoute } from '@owlmeans/route'

export const config = <C extends Config>(service: string, cfg?: Partial<C>): C => {
  const config: C = makeBasicClientConfig<C>(AppType.Backend, service, makeBasicConfig(AppType.Backend, service, cfg))

  return config
}

export const service = <C extends Config>(service: Omit<ServiceRoute, "resolved">, cfg?: Partial<C>): C =>
  ({ ...cfg, services: { ...cfg?.services, [service.service]: { ...service, resolved: service.host != null } } } as C)
