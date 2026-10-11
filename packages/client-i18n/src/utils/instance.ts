
import { createInstance, type i18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { ClientConfig } from '@owlmeans/client-context'
import { DEFAULT_LNG, DEFAULT_NAMESPACE, SUPPORTED_LNGS, i18nHelper } from '@owlmeans/i18n'
import { logEnabled, logger } from '@owlmeans/log'
import { LNG_STORAGE_KEY } from './consts.local.js'
import type { I18nInstanceHelper } from './instance/types.js'

// Process-wide state: one i18next instance per document, shared by every caller.
let i18nInstance: i18n | null = null

/** The language `prepareI18n` loaded; the instance starts in it when created afterwards. */
let preparedLng: string | undefined

/** The language of the latest `setLanguage` call — an earlier call that finishes later yields to it. */
let requestedLng: string | undefined

export const createI18nInstanceHelper = (): I18nInstanceHelper => {
  const log = logger('i18n')

  /** i18next's own logger module: its output goes through `@owlmeans/log`, at the `i18n` scope. */
  const i18nextLogger = {
    type: 'logger' as const,
    log: (args: unknown[]) => log.debug(args.map(String).join(' ')),
    warn: (args: unknown[]) => log.warn(args.map(String).join(' ')),
    error: (args: unknown[]) => log.error(args.map(String).join(' ')),
  }

  const getI18nInstance = (config: ClientConfig): i18n =>
    createI18nInstance(config)

  const setLanguage = (lng: string): Promise<void> => switchLanguage(lng, true)

  /**
   * `setLanguage`'s body. `persist` is false only for the start-up switch to a language nobody chose
   * (a browser-detected one): only an explicit choice is ever written to `owlmeans-lng`.
   */
  const switchLanguage = async (lng: string, persist: boolean): Promise<void> => {
    requestedLng = lng
    await i18nHelper.loadI18nLanguage(lng)
    if (requestedLng !== lng) {
      return
    }
    if (persist) {
      try {
        localStorage.setItem(LNG_STORAGE_KEY, lng)
      } catch (_) { /* noop in non-browser environments */ }
    }
    if (i18nInstance == null) {
      preparedLng = lng
      return
    }
    await i18nInstance.changeLanguage(lng)
  }

  const prepareI18n = async (config: ClientConfig): Promise<string> => {
    const fallback = resolveFallbackLanguage(config)
    await i18nHelper.loadI18nLanguage(fallback)
    const lng = resolveInitialLanguage(config)
    try {
      await i18nHelper.loadI18nLanguage(lng)
      preparedLng = lng
    } catch (error) {
      log.error(`failed to load pack for "${lng}"`, error)
      preparedLng = fallback
    }

    return preparedLng
  }

  const resolveInitialLanguage = (config: ClientConfig): string => {
    const supportedLngs = config.i18n?.supportedLngs ?? [...SUPPORTED_LNGS]
    const persistedLng = getPersistedLanguage()

    return persistedLng != null && supportedLngs.includes(persistedLng)
      ? persistedLng
      : preferredLanguageOf(supportedLngs, browserLanguages()) ?? resolveFallbackLanguage(config)
  }

  const resolveFallbackLanguage = (config: ClientConfig): string =>
    config.i18n?.fallbackLng ?? config.i18n?.defaultLng ?? DEFAULT_LNG

  const getPersistedLanguage = (): string | null => {
    try {
      return localStorage.getItem(LNG_STORAGE_KEY)
    } catch (_) {
      return null
    }
  }

  const preferredLanguageOf = (
    supportedLngs: readonly string[], preferred: readonly (string | null | undefined)[],
  ): string | null => {
    const supported = new Map(supportedLngs.map(lng => [lng.toLowerCase(), lng]))
    for (const candidate of preferred) {
      const tag = candidate?.trim().toLowerCase() ?? ''
      if (tag === '') continue
      const match = supported.get(tag) ?? supported.get(tag.split(/[-_]/)[0])
      if (match != null) return match
    }

    return null
  }

  /** The browser's preferred languages, in order; `[]` outside a browser. */
  const browserLanguages = (): readonly string[] => {
    try {
      if (typeof navigator === 'undefined') return []
      return navigator.languages != null && navigator.languages.length > 0
        ? navigator.languages
        : navigator.language != null ? [navigator.language] : []
    } catch (_) {
      return []
    }
  }

  const createI18nInstance = (config: ClientConfig): i18n => {
    if (i18nInstance != null) {
      return i18nInstance
    }

    const fallbackLng = resolveFallbackLanguage(config)
    const supportedLngs = config.i18n?.supportedLngs ?? [...SUPPORTED_LNGS]
    const wantedLng = preparedLng ?? resolveInitialLanguage(config)
    // Safety net for a host that did not await `prepareI18n`: start in the fallback and switch once
    // the wanted language's loaders finish — a brief fallback flash instead of a half-loaded language.
    const loaded = i18nHelper.isI18nLanguageLoaded(wantedLng)
    const lng = loaded ? wantedLng : fallbackLng

    const instance = createInstance({
      // No `compatibilityJSON` — i18next >= 26 accepts only the v4 JSON format
      // (Intl.PluralRules suffixes `_one`/`_other`, not the v3 `_plural`/`_0`/`_1`).
      // No resource in the ecosystem uses plural-suffixed keys; `{{count}}` is plain
      // interpolation, so the v4 default is a no-op here.
      defaultNS: config.i18n?.defaultNs ?? DEFAULT_NAMESPACE,
      fallbackLng,
      lng,
      supportedLngs,
      // The process's log policy decides, not `cfg.debug.all` (which an application sets for other
      // reasons and which is on in every OwlMeans app): verbose i18next output is the `i18n` scope
      // at debug — `cfg.log.level: 'debug'` or `cfg.log.debug: 'i18n'`.
      debug: logEnabled('debug', 'i18n'),
    })

    instance.use(i18nextLogger).use(initReactI18next).init()

    i18nInstance = instance

    if (!loaded) {
      // Not persisted: `wantedLng` may be a browser-detected language nobody chose.
      switchLanguage(wantedLng, false).catch((error: unknown) => {
        log.error(`failed to load pack for "${wantedLng}"`, error)
      })
    }

    return instance
  }

  return { getI18nInstance, setLanguage, prepareI18n, resolveInitialLanguage, preferredLanguageOf }
}

export const i18nInstanceHelper = createI18nInstanceHelper()

/** @deprecated compat:factory-refactor — use `i18nInstanceHelper.getI18nInstance(…)` */
export const getI18nInstance = (config: ClientConfig): i18n => i18nInstanceHelper.getI18nInstance(config)

/** @deprecated compat:factory-refactor — use `i18nInstanceHelper.setLanguage(…)` */
export const setLanguage = (lng: string): Promise<void> => i18nInstanceHelper.setLanguage(lng)

/** @deprecated compat:factory-refactor — use `i18nInstanceHelper.prepareI18n(…)` */
export const prepareI18n = (config: ClientConfig): Promise<string> => i18nInstanceHelper.prepareI18n(config)

/** @deprecated compat:factory-refactor — use `i18nInstanceHelper.preferredLanguageOf(…)` */
export const preferredLanguageOf = (
  supportedLngs: readonly string[], preferred: readonly (string | null | undefined)[],
): string | null => i18nInstanceHelper.preferredLanguageOf(supportedLngs, preferred)
