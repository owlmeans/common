
import { createInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { i18n } from 'i18next'
import { useMemo } from 'react'
import type { ClientConfig } from '@owlmeans/client-context'
import { DEFAULT_LNG, DEFAULT_NAMESPACE, SUPPORTED_LNGS } from '@owlmeans/i18n'

const LNG_STORAGE_KEY = 'owlmeans-lng'

let i18nInstance: i18n | null = null

export const useI18nInstance = (config: ClientConfig): i18n => {
  const instance = useMemo(() => createI18nInstance(config), [])

  return instance
}

export const getI18nInstance = (config: ClientConfig): i18n =>
  createI18nInstance(config)

export const setLanguage = (lng: string): void => {
  if (i18nInstance == null) return
  try {
    localStorage.setItem(LNG_STORAGE_KEY, lng)
  } catch (_) { /* noop in non-browser environments */ }
  i18nInstance.changeLanguage(lng)
}

const getPersistedLanguage = (): string | null => {
  try {
    return localStorage.getItem(LNG_STORAGE_KEY)
  } catch (_) {
    return null
  }
}

const createI18nInstance = (config: ClientConfig): i18n => {
  if (i18nInstance != null) {
    return i18nInstance
  }

  const fallbackLng = config.i18n?.fallbackLng ?? config.i18n?.defaultLng ?? DEFAULT_LNG
  const supportedLngs = config.i18n?.supportedLngs ?? [...SUPPORTED_LNGS]
  const persistedLng = getPersistedLanguage()
  const lng = persistedLng != null && supportedLngs.includes(persistedLng)
    ? persistedLng
    : fallbackLng

  const instance = createInstance({
    compatibilityJSON: 'v3',
    defaultNS: config.i18n?.defaultNs ?? DEFAULT_NAMESPACE,
    fallbackLng,
    lng,
    supportedLngs,
    debug: config.debug?.all ?? config.debug?.i18n ?? false,
  })

  instance.use(initReactI18next).init()

  return i18nInstance = instance
}
