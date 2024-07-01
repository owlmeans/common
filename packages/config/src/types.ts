import type { CONFIG_RECORD, ConfigRecord } from '@owlmeans/context'
import type { Resource } from '@owlmeans/resource'
import type { BasicConfig } from './utils'
import type { Profile } from '@owlmeans/auth'

export interface ConfigResource extends Resource<ConfigRecord> {
}

export interface Config extends BasicConfig {
  trusted: Profile[]
  [CONFIG_RECORD]: ConfigRecord[]
}

export interface ConfigResourceAppend {
  getConfigResource: () => ConfigResource
}
