import { BasicClientConfig } from '@owlmeans/client-config'
import type { BasicContext } from '@owlmeans/context'

export type Config = BasicClientConfig

export interface Context<C extends Config = Config> extends BasicContext<C> {
}
