import type { Config } from '@owlmeans/client-context'
import { config as makeConfig } from '@owlmeans/client'

export const config = <C extends Config>(
  service: string, cfg?: Partial<C>
): C => {
  return {
    ...makeConfig(service), ...cfg
  }
}
