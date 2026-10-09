import { CONSENT_GEO_UNKNOWN } from './consts.js'
import { COUNTRY_CODE } from './consts.local.js'
import type { ConsentGeoLocation, ConsentOptions, ConsentRecord, ConsentPlugin } from './types.js'
import type { ConsentPluginHelper } from './plugins/types.js'

/**
 * Module-global by design, like `@owlmeans/client-auth/login`'s method/step registries: consent is
 * one thing per document, not per component tree, and a plugin is installed once at bundle scope
 * (an Astro island, a script tag, a React app) regardless of how many components read the store.
 */
const plugins = new Map<string, ConsentPlugin>()

export const createConsentPluginHelper = (): ConsentPluginHelper => {
  const registerConsentPlugin = (plugin: ConsentPlugin): void => {
    plugins.set(plugin.alias, plugin)
  }

  const unregisterConsentPlugin = (alias: string): void => {
    plugins.delete(alias)
  }

  const consentPlugins = (): ConsentPlugin[] =>
    [...plugins.values()].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

  const decorateConsentUrl = (
    url: string | URL, record: ConsentRecord | null, opts: ConsentOptions
  ): URL => {
    let result = url instanceof URL ? url : new URL(url)
    for (const plugin of consentPlugins()) {
      if (plugin.decorate == null) {
        continue
      }
      const decorated = plugin.decorate(result, record, opts)
      if (decorated != null) {
        result = decorated
      }
    }

    return result
  }

  const consentDomains = (opts: ConsentOptions): string[] => {
    const host = typeof location !== 'undefined' ? location.hostname : ''
    const named = consentPlugins().flatMap(plugin => plugin.domains?.(opts) ?? [])

    return [...new Set([host, ...named].filter(domain => domain !== ''))]
  }

  const adoptConsent = (opts: ConsentOptions): ConsentRecord | null => {
    for (const plugin of consentPlugins()) {
      const adopted = plugin.adopt?.(opts)
      if (adopted != null) {
        return adopted
      }
    }

    return null
  }

  const adoptConsentLanguage = (opts: ConsentOptions): string | null => {
    for (const plugin of consentPlugins()) {
      const adopted = plugin.adoptLanguage?.(opts)
      if (adopted != null) {
        return adopted
      }
    }

    return null
  }

  const startConsentPlugins = (opts: ConsentOptions): void => {
    for (const plugin of consentPlugins()) {
      plugin.start?.(opts)
    }
  }

  const locateConsent = async (opts: ConsentOptions): Promise<ConsentGeoLocation> => {
    let failure: unknown = new Error('consent:geo:no-locator')
    for (const plugin of consentPlugins()) {
      if (plugin.locate == null) {
        continue
      }
      try {
        const country = (await plugin.locate(opts))?.country?.trim().toUpperCase() ?? ''
        if (COUNTRY_CODE.test(country) && !CONSENT_GEO_UNKNOWN.includes(country)) {
          return { country }
        }
        failure = new Error(`consent:geo:unusable-country:${plugin.alias}`)
      } catch (error) {
        failure = error
      }
    }

    throw failure
  }

  return {
    registerConsentPlugin, unregisterConsentPlugin, consentPlugins, decorateConsentUrl,
    consentDomains, adoptConsent, adoptConsentLanguage, startConsentPlugins, locateConsent,
  }
}

export const consentPluginHelper = createConsentPluginHelper()

/** @deprecated compat:factory-refactor — use `consentPluginHelper.decorateConsentUrl(…)` */
export const decorateConsentUrl = (url: string | URL, record: ConsentRecord | null, opts: ConsentOptions): URL =>
  consentPluginHelper.decorateConsentUrl(url, record, opts)
