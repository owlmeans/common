
import { AppType, makeBasicConfig } from '@owlmeans/context'
import type { ServerConfig } from './types.js'

export const config = <C extends ServerConfig>(service: string, cfg?: Partial<C>): C => {
  const config: C = makeBasicConfig(AppType.Backend, service, cfg)
  config.trusted = config.trusted ?? []

  return config
}
