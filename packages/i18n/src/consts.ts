
export const DEFAULT_NAMESPACE = 'translation'

export const LIB_NAMESPACE = 'lib'

export const DEFAULT_LNG = 'en'

export const SUPPORTED_LNGS = ['en', 'pl', 'ru', 'be', 'uk', 'es', 'de'] as const

export type SupportedLng = (typeof SUPPORTED_LNGS)[number]

export const MAX_PRIORITY = Number.MAX_SAFE_INTEGER

export enum I18nTier {
  Library = 'library',
  App = 'app',
}

/** @deprecated use I18nTier */
export const I18nLevel = I18nTier
