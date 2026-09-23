
import { createInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { i18n } from 'i18next'
import { useMemo } from 'react'
import type { ClientConfig } from '@owlmeans/client-context'
import { DEFAULT_LNG, DEFAULT_NAMESPACE, SUPPORTED_LNGS, isI18nLanguageLoaded, loadI18nLanguage } from '@owlmeans/i18n'

const LNG_STORAGE_KEY = 'owlmeans-lng'

let i18nInstance: i18n | null = null

/** The language `prepareI18n` loaded; the instance starts in it when created afterwards. */
let preparedLng: string | undefined

/** The language of the latest `setLanguage` call — an earlier call that finishes later yields to it. */
let requestedLng: string | undefined

export const useI18nInstance = (config: ClientConfig): i18n => {
  const instance = useMemo(() => createI18nInstance(config), [])

  return instance
}

export const getI18nInstance = (config: ClientConfig): i18n =>
  createI18nInstance(config)

/**
 * Load `lng`'s registered loaders, then persist it and switch the instance to it. Race-safe:
 * when several calls overlap, the latest one wins whatever order their loads finish in.
 * Rejects when the language's pack fails to load; nothing is persisted or switched then.
 */
export const setLanguage = (lng: string): Promise<void> => switchLanguage(lng, true)

/**
 * `setLanguage`'s body. `persist` is false only for the start-up switch to a language nobody chose
 * (a browser-detected one): only an explicit choice is ever written to `owlmeans-lng`.
 */
const switchLanguage = async (lng: string, persist: boolean): Promise<void> => {
  requestedLng = lng
  await loadI18nLanguage(lng)
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

/**
 * Await the app's fallback language and its initial one (`resolveInitialLanguage`) before the app
 * renders, so the first paint is already in the right language instead of flashing the
 * fallback and then switching. Call it BEFORE `render(...)`. Resolves to the language the
 * instance will start in: the fallback when the initial language's pack fails to load — the
 * persisted choice is kept then, so the next visit retries it. Rejects only when the fallback
 * language's own pack fails.
 */
export const prepareI18n = async (config: ClientConfig): Promise<string> => {
  const fallback = resolveFallbackLanguage(config)
  await loadI18nLanguage(fallback)
  const lng = resolveInitialLanguage(config)
  try {
    await loadI18nLanguage(lng)
    preparedLng = lng
  } catch (error) {
    console.error(`[i18n] failed to load pack for "${lng}"`, error)
    preparedLng = fallback
  }

  return preparedLng
}

/**
 * The language the app starts in: the one persisted under `owlmeans-lng` when it is still in
 * `supportedLngs` (a person's explicit choice); else, on a first visit, the browser's own language
 * (`navigator.languages` through `preferredLanguageOf` — a German browser opens in German); else
 * `fallbackLng ?? defaultLng ?? DEFAULT_LNG`. The instance is initialized with this explicit `lng`,
 * so a detector plugin installed afterwards (`instance.use(detector)`) is never consulted.
 */
export const resolveInitialLanguage = (config: ClientConfig): string => {
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

/**
 * The first of the browser's preferred languages the application supports — exact (`pt-BR`) or by
 * its base (`de-DE` → `de`) — or `null` when none is. Pure, so a host (or a test) can pass the list.
 */
export const preferredLanguageOf = (
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
  const loaded = isI18nLanguageLoaded(wantedLng)
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
    debug: config.debug?.all ?? config.debug?.i18n ?? false,
  })

  instance.use(initReactI18next).init()

  i18nInstance = instance

  if (!loaded) {
    // Not persisted: `wantedLng` may be a browser-detected language nobody chose.
    switchLanguage(wantedLng, false).catch((error: unknown) => {
      console.error(`[i18n] failed to load pack for "${wantedLng}"`, error)
    })
  }

  return instance
}
