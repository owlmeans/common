import { AppType } from '@owlmeans/context'
import type { Config } from './types.js'
import { makeConfig as makeBasicConfig } from '@owlmeans/client-config'
import type { ServiceRoute } from '@owlmeans/route'

export const makeConfig = <C extends Config>(type: AppType, service: string, cfg?: Partial<C>): C => {
  const config: C = {
    ...makeBasicConfig(type, service),
    ...cfg
  }

  return config
}

export const service = <C extends Config>(service: Omit<ServiceRoute, "resolved">, cfg?: Partial<C>): C =>
({
  ...cfg, services: {
    ...cfg?.services, [service.service]: { ...service, resolved: service.host != null }
  }
} as C)
