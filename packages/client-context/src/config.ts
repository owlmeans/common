
import { AppType, makeBasicConfig } from '@owlmeans/context'
import type { ClientConfig } from './types.js'

export const config = <C extends ClientConfig>(service: string, cfg?: Partial<C>): C => {
  const config: C = makeBasicConfig(AppType.Frontend, service, cfg)

  return config
}
