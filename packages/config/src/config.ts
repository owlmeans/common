import type { Config } from './types.js'
import { AppType, CONFIG_RECORD, makeConfig as makeBasicConfig } from '@owlmeans/context'

export const makeConfig = <C extends Config>(type: AppType, service: string, cfg?: Partial<C>): C => {
  const config: C = {
    ...makeBasicConfig(type, service),
    trusted: [], [CONFIG_RECORD]: [], ...cfg
  }

  return config as C
}
