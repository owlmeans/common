import type { AppType, BasicConfig, CONFIG_RECORD, ConfigRecord } from '@owlmeans/context'
import type { Resource, DbConfig } from '@owlmeans/resource'
import type { Profile } from '@owlmeans/auth'
import type { PLUGIN_RECORD } from './consts.js'
import type { BasicRoute, CommonRoute, RouteProtocols } from '@owlmeans/route'

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
  security?: SecurityConfig
  // @TODO Move to brand settings
  defaultEntityId?: string
  brand: BrandSettings
}

export interface BrandSettings {
  home?: string
}

export interface PluginConfig extends ConfigRecord {
  type?: AppType
  value?: string
}

export interface ConfigResourceAppend {
  getConfigResource: <T extends ConfigRecord, R extends ConfigResource<T>>(alias?: string) => R
}

export interface SecurityConfig {
  unsecure?: boolean
  auth?: {
    flow?: string
    enter?: string
  }
}

export interface SecurityHelper {
  makeUrl: (route: BasicRoute | CommonRoute, path?: string | SecurityHelperUrlParams, params?: SecurityHelperUrlParams) => string
  url: (path?: string, params?: SecurityHelperUrlParams) => string
}

export interface SecurityHelperUrlParams {
  path?: string
  forceUnsecure?: boolean
  protocol?: RouteProtocols
  host?: string
  base?: string | boolean
}
