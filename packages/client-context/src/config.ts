export { service } from '@owlmeans/config'

import { AppType } from '@owlmeans/context'
import type { Config } from './types.js'
import { makeConfig as makeBasicConfig } from '@owlmeans/client-config'

export const makeConfig = <C extends Config>(type: AppType, service: string, cfg?: Partial<C>): C => {
  const config: C = {
    ...makeBasicConfig(type, service),
    ...cfg
  }

  return config
}
