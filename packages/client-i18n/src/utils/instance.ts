
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
export const setLanguage = async (lng: string): Promise<void> => {
  requestedLng = lng
  await loadI18nLanguage(lng)
  if (requestedLng !== lng) {
    return
  }
  try {
    localStorage.setItem(LNG_STORAGE_KEY, lng)
  } catch (_) { /* noop in non-browser environments */ }
  if (i18nInstance == null) {
    preparedLng = lng
    return
  }
  await i18nInstance.changeLanguage(lng)
}

/**
 * Await the app's fallback language and its initial (persisted-or-fallback) language before the
 * app renders, so the first paint is already in the right language instead of flashing the
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
 * `supportedLngs`, else `fallbackLng ?? defaultLng ?? DEFAULT_LNG`.
 */
export const resolveInitialLanguage = (config: ClientConfig): string => {
  const supportedLngs = config.i18n?.supportedLngs ?? [...SUPPORTED_LNGS]
  const persistedLng = getPersistedLanguage()

  return persistedLng != null && supportedLngs.includes(persistedLng)
    ? persistedLng
    : resolveFallbackLanguage(config)
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
    setLanguage(wantedLng).catch((error: unknown) => {
      console.error(`[i18n] failed to load pack for "${wantedLng}"`, error)
    })
  }

  return instance
}
