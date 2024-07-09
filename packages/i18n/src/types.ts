import type { I18nLevel } from './consts.js'

export interface I18nStorage {
  data: I18nNamespaces
}

export interface I18nNamespaces extends Record<string, I18nResources> { }

export interface I18nResources extends Record<string, I18nLanguages> { }

export interface I18nLanguages extends Record<string, {
  resources: I18nResource[],
  lngInitialized: string[]
}> { }

export interface I18nResource {
  ns?: string
  lng?: string
  level: I18nLevel
  resource: string
  priority?: number
  data: Record<string, any>
}

export interface I18nResourceOptions {
  priroty?: number
  ns?: string
}

export interface I18nResourceSignature {
  (level: I18nLevel, lng: string, resource: string, data: Record<string, any>, opts?: I18nResourceOptions | string): void
}

export interface I18nLeveledResourceSignature {
  (lng: string, resource: string, data: Record<string, any>, opts?: I18nResourceOptions | string): void
}

export interface I18nConfig {
  defaultLng?: string
  defaultNs?: string
}
