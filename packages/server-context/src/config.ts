
import { AppType, makeConfig as makeBasicConfig } from '@owlmeans/context'
import { makeConfig as makeBasicClientConfig } from '@owlmeans/client-config'
import type { Config } from './types.js'

export const config = <C extends Config>(service: string, cfg?: Partial<C>): C => {
  const config: C = makeBasicClientConfig<C>(AppType.Backend, service, makeBasicConfig(AppType.Backend, service, cfg))

  return config
}
