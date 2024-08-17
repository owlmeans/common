import { memo } from 'react'
import type { FC } from 'react'
import type { I18nContextProps } from './types.js'
import { I18nextProvider, useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useI18nInstance } from './utils/instance.js'
import { DEFAULT_LNG, DEFAULT_NAMESPACE, initI18nResource, LIB_NAMESPACE } from '@owlmeans/i18n'
import { useContext } from '@owlmeans/client'

export const I18nContext: FC<I18nContextProps> = memo(({ config, children }) => {
  const i18n = useI18nInstance(config)

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
})

const i18nLoadingCache = new Set<string>()

export const useCommonI18n = (resourceName: string, ns?: string, prefix?: string): TFunction => {
  const { i18n } = useTranslation()

  ns = ns ?? (Array.isArray(i18n.options.defaultNS)
    ? i18n.options.defaultNS?.[0] : i18n.options.defaultNS)
    ?? DEFAULT_NAMESPACE

  const key = `${i18n.language}:${resourceName}:${ns}`
  if (!i18nLoadingCache.has(key)) {
    i18nLoadingCache.add(key)
    const resources = initI18nResource(i18n.language, resourceName, ns)
    if (resources != null) {
      resources.forEach(
        resource => i18n.addResourceBundle(i18n.language, ns ?? DEFAULT_NAMESPACE, { [resourceName]: resource.data }, true, true)
      )

      const defLng = typeof i18n.options.fallbackLng === 'string' ? i18n.options.fallbackLng : DEFAULT_LNG
      const defResources = initI18nResource(defLng, resourceName, ns)
      defResources?.forEach(
        resource => i18n.addResourceBundle(i18n.language, ns ?? DEFAULT_NAMESPACE, { [resourceName]: resource.data }, true, true)
      )
    }
  }

  const { t } = useTranslation(ns, { keyPrefix: `${resourceName}${prefix != null && prefix != '' ? `.${prefix}` : ''}` })

  return t
}

export const useI18nLib = (libName: string, prefix?: string): TFunction => {
  return useCommonI18n(libName, LIB_NAMESPACE, prefix)
}

export const useI18nApp = (appName?: string, prefix?: string): TFunction => {
  const context = useContext()
  appName = appName ?? context.cfg.service

  return useCommonI18n(appName, appName, prefix)
}
