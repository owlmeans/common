import {
  INQUIRY_ALIAS_PATTERN, INQUIRY_DESCRIPTION_MAX, INQUIRY_FALLBACK_LANGUAGE, INQUIRY_LANGUAGES, INQUIRY_MAX_TABS,
  INQUIRY_TITLE_MAX, INQUIRY_URL_MAX,
} from './consts.js'
import { INQUIRY_LINK_PATTERN } from './consts.local.js'
import type { InquiryConfigHelper } from './config/types.js'
import type { InquiryTab, InquiryWidgetConfig, LocalizedText } from './types.js'

export const createInquiryConfigHelper = (): InquiryConfigHelper => {
  const alias = new RegExp(INQUIRY_ALIAS_PATTERN)
  const link = new RegExp(INQUIRY_LINK_PATTERN)

  /** `pt-BR` / `pt_br` → `pt`. */
  const primaryOf = (language: string): string => language.trim().toLowerCase().split(/[-_]/)[0] ?? ''

  const text: InquiryConfigHelper['text'] = (value, language, fallback = INQUIRY_FALLBACK_LANGUAGE) => {
    if (value == null) {
      return ''
    }
    if (typeof value === 'string') {
      return value
    }
    const exact = value[language]
    if (exact != null) {
      return exact
    }
    const primary = primaryOf(language)
    const byPrimary = Object.entries(value).find(([key]) => primaryOf(key) === primary)?.[1]
    if (byPrimary != null) {
      return byPrimary
    }

    return value[fallback] ?? Object.values(value)[0] ?? ''
  }

  /** The non-empty values a localized text holds, or `null` for a malformed one. */
  const valuesOf = (value: LocalizedText | undefined): string[] | null => {
    if (typeof value === 'string') {
      return [value]
    }
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      return null
    }
    const values = Object.values(value)

    return values.every(entry => typeof entry === 'string') ? values : null
  }

  const checkText = (
    errors: string[], label: string, value: LocalizedText | undefined, max: number, required: boolean
  ): void => {
    if (value == null) {
      if (required) {
        errors.push(`${label} is missing`)
      }
      return
    }
    const values = valuesOf(value)
    if (values == null || values.length === 0 || values.some(entry => entry.trim() === '')) {
      errors.push(`${label} must be a non-empty string or a map of language to non-empty string`)
      return
    }
    if (values.some(entry => entry.length > max)) {
      errors.push(`${label} is longer than ${max} characters`)
    }
  }

  const checkLink = (errors: string[], label: string, value: unknown): void => {
    if (typeof value !== 'string' || value.length > INQUIRY_URL_MAX || !link.test(value)) {
      errors.push(`${label} must be an http(s) URL or a root-relative path`)
    }
  }

  const validate: InquiryConfigHelper['validate'] = config => {
    const errors: string[] = []
    if (config == null || typeof config !== 'object') {
      return ['config must be an object']
    }
    if (typeof config.id !== 'string' || !alias.test(config.id)) {
      errors.push(`id must match ${INQUIRY_ALIAS_PATTERN}`)
    }

    const tabs: unknown = config.tabs
    if (!Array.isArray(tabs) || tabs.length === 0) {
      errors.push('tabs must hold at least one tab')
    } else {
      if (tabs.length > INQUIRY_MAX_TABS) {
        errors.push(`tabs must hold at most ${INQUIRY_MAX_TABS} tabs`)
      }
      const seen = new Set<string>()
      tabs.forEach((tab: InquiryTab | null, index) => {
        if (tab == null || typeof tab !== 'object') {
          errors.push(`tabs[${index}] must be an object`)
          return
        }
        if (typeof tab.alias !== 'string' || !alias.test(tab.alias)) {
          errors.push(`tabs[${index}].alias must match ${INQUIRY_ALIAS_PATTERN}`)
        } else if (seen.has(tab.alias)) {
          errors.push(`tabs[${index}].alias "${tab.alias}" is not unique`)
        } else {
          seen.add(tab.alias)
        }
        checkText(errors, `tabs[${index}].title`, tab.title, INQUIRY_TITLE_MAX, true)
        checkText(errors, `tabs[${index}].description`, tab.description, INQUIRY_DESCRIPTION_MAX, false)
      })
      if (config.defaultTab != null && !seen.has(config.defaultTab)) {
        errors.push(`defaultTab "${String(config.defaultTab)}" names no tab`)
      }
    }

    if (config.legal == null || typeof config.legal !== 'object') {
      errors.push('legal must hold the terms and privacy links')
    } else {
      checkLink(errors, 'legal.terms', config.legal.terms)
      checkLink(errors, 'legal.privacy', config.legal.privacy)
    }

    return errors
  }

  const tabOf: InquiryConfigHelper['tabOf'] = (config: InquiryWidgetConfig, wanted) =>
    (wanted != null ? config.tabs.find(tab => tab.alias === wanted) : undefined)
    ?? (config.defaultTab != null ? config.tabs.find(tab => tab.alias === config.defaultTab) : undefined)
    ?? config.tabs[0]

  const normalizeLanguage: InquiryConfigHelper['normalizeLanguage'] = (
    language, supported = INQUIRY_LANGUAGES, fallback = INQUIRY_FALLBACK_LANGUAGE
  ) => {
    if (language == null || language.trim() === '') {
      return fallback
    }
    const primary = primaryOf(language)

    return supported.includes(primary) ? primary : fallback
  }

  return { text, validate, tabOf, normalizeLanguage }
}

export const inquiryConfigHelper = createInquiryConfigHelper()
