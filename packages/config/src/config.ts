import type { Config } from './types.js'
import type { ServiceRoute } from '@owlmeans/route'
import { AppType, CONFIG_RECORD, makeConfig as makeBasicConfig } from '@owlmeans/context'

export const makeConfig = <C extends Config>(type: AppType, service: string, cfg?: Partial<C>): C => {
  const config: C = {
    ...makeBasicConfig(type, service),
    trusted: [], [CONFIG_RECORD]: [], ...cfg
  }

  return config as C
}

export const service = <C extends Config>(service: Omit<ServiceRoute, "resolved">, cfg?: Partial<C>): C => {
  const _cfg: C = (cfg ?? {}) as C
  if (_cfg.services == null) {
    _cfg.services = {}
  }
  _cfg.services[service.service] = { ...service, resolved: service.host != null }

  return _cfg
}
