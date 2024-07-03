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

export const addWebService = <C extends Config>(service: string, alias?: string, cfg?: Partial<C>): C => {
  const webServices = alias == null
    ? service : cfg?.webService == null
      ? { [DEFAULT_KEY]: service, [alias]: service }
      : typeof cfg.webService === 'string'
        ? { [DEFAULT_KEY]: cfg.webService, [alias]: service }
        : { ...(cfg.webService as Object), [alias]: service }

  const config = { ...cfg, webService: webServices }

  return config as C
}
