
import type { CommonConfig, ConfigResourceAppend } from '@owlmeans/config'
import type { BasicContext } from '@owlmeans/context'

export interface Config extends CommonConfig { }

export interface Context<C extends Config = Config> extends BasicContext<C>
  , ConfigResourceAppend {
}
