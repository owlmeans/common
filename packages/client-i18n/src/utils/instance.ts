
import { createInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { i18n } from 'i18next'
import { useMemo } from 'react'
import type { ClientConfig } from '@owlmeans/client-context'
import { DEFAULT_LNG, DEFAULT_NAMESPACE } from '@owlmeans/i18n'

let i18nInstance: i18n | null = null

export const useI18nInstance = (config: ClientConfig): i18n => {
  const instance = useMemo(() => {
    if (i18nInstance != null) {
      return i18nInstance
    }

    console.log('Initialzie i18n instance')

    const instance = createInstance({
      defaultNS: config.i18n?.defaultNs ?? DEFAULT_NAMESPACE,
      fallbackLng: config.i18n?.defaultLng ?? DEFAULT_LNG,
      debug: true
    })

    instance.use(initReactI18next).init()
    
    return i18nInstance = instance
  }, [])

  return instance
}
