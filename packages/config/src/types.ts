import type { CONFIG_RECORD, ConfigRecord } from '@owlmeans/context'
import type { Resource } from '@owlmeans/resource'
import type { BasicConfig } from './utils'

export interface ConfigResource extends Resource<ConfigRecord> {
}

export interface Config extends BasicConfig {
  [CONFIG_RECORD]: ConfigRecord[]
}

export interface ConfigResourceAppend {
  getConfigResource: () => ConfigResource
}
