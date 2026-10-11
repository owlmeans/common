import { CONSENT_LOCALES, DEFAULT_CONSENT_MESSAGES } from './consts.js'
import type { ConsentLocale } from './types.js'
import type { ConsentI18nHelper } from './i18n/types.js'

export const createConsentI18nHelper = (): ConsentI18nHelper => {
  const normalizeLocale = (locale?: string): ConsentLocale => {
    const base = (locale ?? 'en').toLowerCase().split('-')[0]

    return CONSENT_LOCALES.includes(base as ConsentLocale) ? base as ConsentLocale : 'en'
  }

  const defaultConsentTranslate = (locale?: string) =>
    (key: string, defaultValue: string): string =>
      DEFAULT_CONSENT_MESSAGES[normalizeLocale(locale)]?.[key] ?? defaultValue

  const interpolate = (text: string, values: Record<string, string | number>): string =>
    text.replace(/\{\{([a-z]+)\}\}/gi, (whole, name: string) =>
      values[name] != null ? String(values[name]) : whole)

  return { normalizeLocale, defaultConsentTranslate, interpolate }
}

export const consentI18nHelper = createConsentI18nHelper()

/** @deprecated compat:factory-refactor — use `consentI18nHelper.defaultConsentTranslate(…)` */
export const defaultConsentTranslate = (locale?: string): (key: string, defaultValue: string) => string =>
  consentI18nHelper.defaultConsentTranslate(locale)
