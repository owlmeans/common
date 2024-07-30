import type { AppType, BasicConfig, CONFIG_RECORD, ConfigRecord } from '@owlmeans/context'
import type { Resource } from '@owlmeans/resource'
import type { Profile } from '@owlmeans/auth'
import type { PLUGIN_RECORD } from './consts.js'

export interface ConfigResource<T extends ConfigRecord = ConfigRecord> extends Resource<T> {
}

export interface CommonConfig extends BasicConfig {
  dbs?: DbConfig[]
  trusted: Profile[]
  [CONFIG_RECORD]: ConfigRecord[]
  [PLUGIN_RECORD]?: PluginConfig[]
  debug: BasicConfig["debug"] & {
    i18n?: boolean
  }
}
export interface PluginConfig extends ConfigRecord {
  type?: AppType
  value?: string
}

export interface ConfigResourceAppend {
  getConfigResource: <T extends ConfigRecord>(alias?: string) => ConfigResource<T>
}

export interface DbConfig<P extends {} = {}> {
  service: string
  alias?: string
  host: string | string[]
  port?: number
  user?: string
  secret?: string
  schema?: string
  resourcePrefix?: string
  entitySensitive?: boolean
  meta?: P
}
