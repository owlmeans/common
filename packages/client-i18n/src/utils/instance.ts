
import { createInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { i18n } from 'i18next'
import { useMemo } from 'react'
import type { ClientConfig } from '@owlmeans/client-context'
import { DEFAULT_LNG, DEFAULT_NAMESPACE } from '@owlmeans/i18n'

let i18nInstance: i18n | null = null

export const useI18nInstance = (config: ClientConfig): i18n => {
  const instance = useMemo(() => createI18nInstance(config), [])

  return instance
}

export const getI18nInstance = (config: ClientConfig): i18n =>
  createI18nInstance(config)

const createI18nInstance = (config: ClientConfig): i18n => {
  if (i18nInstance != null) {
    return i18nInstance
  }

  const instance = createInstance({
    compatibilityJSON: 'v3',
    defaultNS: config.i18n?.defaultNs ?? DEFAULT_NAMESPACE,
    fallbackLng: config.i18n?.defaultLng ?? DEFAULT_LNG,
    debug: config.debug?.all ?? config.debug?.i18n ?? false,
  })

  instance.use(initReactI18next).init()

  return i18nInstance = instance
}
