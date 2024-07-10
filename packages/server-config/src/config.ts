
import { AppType } from '@owlmeans/config'
import type { BasicServerConfig}  from './types.js'
import type { ServiceRoute } from '@owlmeans/server-route'

export const sservice = <C extends BasicServerConfig>(service: Omit<ServiceRoute, "resolved" | "type">, cfg?: Partial<C>): C => {
  const _cfg: C = (cfg ?? {}) as C
  if (_cfg.services == null) {
    _cfg.services = {}
  }
  _cfg.services[service.service] = { type: AppType.Backend, ..._cfg.services[service.service], ...service, resolved: service.host != null }

  return _cfg
}
