import type { CommonConfig } from './types.js'
import type { CommonServiceRoute } from '@owlmeans/route'
import { AppType, CONFIG_RECORD, makeBasicConfig } from '@owlmeans/context'

export const makeConfig = <C extends CommonConfig>(type: AppType, service: string, cfg?: Partial<C>): C => {
  const config: C = {
    ...makeBasicConfig(type, service),
    trusted: [], [CONFIG_RECORD]: [], ...cfg
  }

  return config as C
}

export const service = <C extends CommonConfig>(service: Omit<CommonServiceRoute, "resolved">, cfg?: Partial<C>): C => {
  const _cfg: C = (cfg ?? {}) as C
  if (_cfg.services == null) {
    _cfg.services = {}
  }
  _cfg.services[service.service] = { ...service, resolved: service.host != null }

  return _cfg
}
