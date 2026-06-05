import type { I18nTier } from './consts.js'

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
  tier: I18nTier
  resource: string
  priority?: number
  data: Record<string, any>
}

export interface I18nResourceOptions {
  priority?: number
  ns?: string
}

export interface I18nResourceSignature {
  (tier: I18nTier, lng: string, resource: string, data: Record<string, any>, opts?: I18nResourceOptions | string): void
}

export interface I18nLeveledResourceSignature {
  (lng: string, resource: string, data: Record<string, any>, opts?: I18nResourceOptions | string): void
}

export interface I18nConfig {
  defaultLng?: string
  defaultNs?: string
  fallbackLng?: string
  supportedLngs?: string[]
}
