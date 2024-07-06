import { AppType } from '@owlmeans/context'
import type { Config } from './types.js'
import { makeConfig as makeBasicConfig } from '@owlmeans/config'
import { DEFAULT_KEY } from './consts.js'

export const makeConfig = <C extends Config>(type: AppType, service: string, cfg?: Partial<C>): C => {
  const config: C = {
    ...makeBasicConfig(type, service),
    ...cfg
  }

  return config
}

export const addWebService = <C extends Config>(service: string, alias?: string | Partial<C>, cfg?: Partial<C>): C => {
  const _cfg: C = (cfg ?? (typeof alias === 'object' ? alias : undefined ) ?? {}) as C

  if (alias == null || typeof alias === 'object') {
    if (typeof _cfg.webService === 'string' || _cfg.webService == null) {
      _cfg.webService = service
    } else {
      _cfg.webService[DEFAULT_KEY] = service
    }
  } else {
    if (_cfg.webService == null) {
      _cfg.webService = { [DEFAULT_KEY]: service, [alias]: service }
    } else if (typeof _cfg.webService === 'string') {
      _cfg.webService = { [DEFAULT_KEY]: _cfg.webService, [alias]: service }
    } else {
      _cfg.webService[alias] = service
    }
  }

  return _cfg
}