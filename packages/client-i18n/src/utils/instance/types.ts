import type { i18n } from 'i18next'
import type { ClientConfig } from '@owlmeans/client-context'

/** The process's one i18next instance and the language it runs in. */
export interface I18nInstanceHelper {
  /** The process's i18next instance, created on first use from `config`. */
  getI18nInstance: (config: ClientConfig) => i18n
  /**
   * Load `lng`'s registered loaders, then persist it and switch the instance to it. Race-safe:
   * when several calls overlap, the latest one wins whatever order their loads finish in.
   * Rejects when the language's pack fails to load; nothing is persisted or switched then.
   *
   * The choice is stored unconditionally: the interface language is strictly necessary storage — the
   * visitor asked for it by choosing it — so no cookie decision stands between a switch and
   * `owlmeans-lng`.
   */
  setLanguage: (lng: string) => Promise<void>
  /**
   * Await the app's fallback language and its initial one (`resolveInitialLanguage`) before the app
   * renders, so the first paint is already in the right language instead of flashing the
   * fallback and then switching. Call it BEFORE `render(...)`. Resolves to the language the
   * instance will start in: the fallback when the initial language's pack fails to load — the
   * persisted choice is kept then, so the next visit retries it. Rejects only when the fallback
   * language's own pack fails.
   */
  prepareI18n: (config: ClientConfig) => Promise<string>
  /**
   * The language the app starts in: the one persisted under `owlmeans-lng` when it is still in
   * `supportedLngs` (a person's explicit choice); else, on a first visit, the browser's own language
   * (`navigator.languages` through `preferredLanguageOf` — a German browser opens in German); else
   * `fallbackLng ?? defaultLng ?? DEFAULT_LNG`. The instance is initialized with this explicit `lng`,
   * so a detector plugin installed afterwards (`instance.use(detector)`) is never consulted.
   */
  resolveInitialLanguage: (config: ClientConfig) => string
  /**
   * The first of the browser's preferred languages the application supports — exact (`pt-BR`) or by
   * its base (`de-DE` → `de`) — or `null` when none is. Pure, so a host (or a test) can pass the list.
   */
  preferredLanguageOf: (supportedLngs: readonly string[], preferred: readonly (string | null | undefined)[]) => string | null
}
