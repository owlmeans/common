
import type { BasicContext, BasicConfig } from '@owlmeans/context'

export interface Config extends BasicConfig {}

export interface Context<C extends Config = Config> extends BasicContext<C> {}
