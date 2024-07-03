import { AppType, Layer } from './consts.js'
import type { Config } from './types.js'

export const makeConfig = <C extends Config>(type: AppType, service: string, cfg?: Partial<C>): C => {
  const config = {
    ready: false,
    service,
    layer: type === AppType.Frontend ? Layer.Service : Layer.System,
    type,
    services: {},
    records: [],
    ...cfg
  }

  return config as unknown as C
}
