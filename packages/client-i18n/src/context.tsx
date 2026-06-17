import { memo, useCallback, useState } from 'react'
import type { FC } from 'react'
import type { I18nContextProps } from './types.js'
import { I18nextProvider, useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { setLanguage, useI18nInstance } from './utils/instance.js'
import { DEFAULT_LNG, DEFAULT_NAMESPACE, initI18nResource, LIB_NAMESPACE } from '@owlmeans/i18n'
import { useContext } from '@owlmeans/client'

export const I18nContext: FC<I18nContextProps> = memo(({ config, children }) => {
  const i18n = useI18nInstance(config)

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
})

/** Join a parent prefix with a child segment using a dot, handling empty/undefined gracefully. */
export const composePrefix = (parent?: string, child?: string): string => {
  if (parent != null && parent !== '' && child != null && child !== '') {
    return `${parent}.${child}`
  }
  return parent ?? child ?? ''
}

const i18nLoadingCache = new Set<string>()

const useI18nResource = (resourceName: string, ns?: string, prefix?: string): TFunction => {
  const { i18n } = useTranslation()

  const resolvedNs = ns ?? (Array.isArray(i18n.options.defaultNS)
    ? i18n.options.defaultNS?.[0] : i18n.options.defaultNS as string | undefined)
    ?? DEFAULT_NAMESPACE

  const key = `${i18n.language}:${resourceName}:${resolvedNs}`
  if (!i18nLoadingCache.has(key)) {
    i18nLoadingCache.add(key)
    const resources = initI18nResource(i18n.language, resourceName, resolvedNs)
    if (resources != null) {
      resources.forEach(
        resource => i18n.addResourceBundle(i18n.language, resolvedNs, { [resourceName]: resource.data }, true, true)
      )
    }
    // Load fallback language bundles into the fallback language slot (not current)
    const defLng = typeof i18n.options.fallbackLng === 'string' ? i18n.options.fallbackLng : DEFAULT_LNG
    if (defLng !== i18n.language) {
      const fallbackKey = `${defLng}:${resourceName}:${resolvedNs}`
      if (!i18nLoadingCache.has(fallbackKey)) {
        i18nLoadingCache.add(fallbackKey)
        const defResources = initI18nResource(defLng, resourceName, resolvedNs)
        defResources?.forEach(
          resource => i18n.addResourceBundle(defLng, resolvedNs, { [resourceName]: resource.data }, true, true)
        )
      }
    }
  }

  const { t } = useTranslation(resolvedNs, {
    keyPrefix: composePrefix(resourceName, prefix !== '' ? prefix : undefined)
  })

  return t
}

/** Low-level hook: explicit resource name and optional namespace. Use this when
 *  you need to override both ns and resource independently (e.g. inside panel contexts). */
export const useI18n = (resource: string, ns?: string, prefix?: string): TFunction => {
  return useI18nResource(resource, ns, prefix)
}

export const useI18nLib = (libName: string, prefix?: string): TFunction => {
  return useI18nResource(libName, LIB_NAMESPACE, prefix)
}

export const useI18nApp = (appName?: string, prefix?: string): TFunction => {
  const context = useContext()
  const resolvedName = appName ?? context.cfg.service

  return useI18nResource(resolvedName, resolvedName, prefix)
}

export const useLanguage = (): [string, (lng: string) => void] => {
  const { i18n } = useTranslation()
  const [lng, setLng] = useState(i18n.language)

  const changeLng = useCallback((next: string) => {
    setLanguage(next)
    setLng(next)
  }, [])

  return [lng, changeLng]
}
