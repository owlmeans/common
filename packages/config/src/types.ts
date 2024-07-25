import type { BasicConfig, CONFIG_RECORD, ConfigRecord } from '@owlmeans/context'
import type { Resource } from '@owlmeans/resource'
import type { Profile } from '@owlmeans/auth'

export interface ConfigResource<T extends ConfigRecord = ConfigRecord> extends Resource<T> {
}

export interface CommonConfig extends BasicConfig {
  dbs?: DbConfig[]
  trusted: Profile[]
  [CONFIG_RECORD]: ConfigRecord[]
  debug: {[section: string]: boolean | undefined} & {
    i18n?: boolean
  }
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
