import { AppType } from './consts.js'
import type { BasicConfig } from './types.js'

export const makeBasicConfig = <C extends BasicConfig>(type: AppType, service: string, cfg?: Partial<C>): C => {
  const config = {
    ready: false,
    service,
    type,
    debug: {},
    services: {},
    records: [],
    ...cfg
  } as C

  return config
}
