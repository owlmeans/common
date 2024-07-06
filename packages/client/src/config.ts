import type { Config } from '@owlmeans/client-context'
import { makeConfig } from '@owlmeans/client-context'
import { AppType } from '@owlmeans/context'

export const config = <C extends Config>(
  service: string, cfg?: Partial<C>
): C => {
  return {
    ...makeConfig(AppType.Frontend, service), ...cfg
  }
}
