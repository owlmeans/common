import type { I18nLeveledResourceSignature, I18nLoader, I18nResource } from '../types.js'

/** The process-wide i18n registry: resource bundles per (ns, resource, language) and language loaders. */
export interface I18nHelper {
  /** Registers a library-tier bundle; its namespace defaults to `lib`. */
  addI18nLib: I18nLeveledResourceSignature
  /** Registers an app-tier bundle; its namespace defaults to the resource name. */
  addI18nApp: I18nLeveledResourceSignature
  /**
   * Drains the bundles of one (ns, resource, language) slot in merge order — library tier before app
   * tier, then `priority` ascending. `null` once the slot was drained for the language.
   */
  initI18nResource: (lng: string, resource: string, ns?: string) => null | I18nResource[]
  /**
   * The merged bundle of one (ns, resource, language) slot, read WITHOUT draining it.
   *
   * Every registered bundle is deep-merged in the order `initI18nResource` hands them out — library
   * tier before app tier, then `priority` ascending, a bundle with no priority last — so an app
   * override wins exactly as it does in i18next. The slot is never marked drained and no empty slot
   * is created, so a later `initI18nResource` still returns the same bundles. This is the read for
   * code with no i18next instance (a server rendering an e-mail) and for a language other than the
   * active one (a legal text shown in the billing country's language). `null` when nothing is
   * registered for the slot.
   */
  resolveI18nResource: (lng: string, resource: string, ns?: string) => Record<string, unknown> | null
  /**
   * Register a loader for a language's resources — typically a dynamic `import()` of a module that
   * calls `addI18nLib` / `addI18nApp`. If the language was already requested (`loadI18nLanguage` was
   * called for it), the loader starts at once: one registered late, by a module that only evaluates
   * after the app started, is never silently skipped. Its failure then surfaces through the next
   * `loadI18nLanguage` call, which retries it.
   */
  addI18nLoader: (lng: string, loader: I18nLoader) => void
  /**
   * Await every loader registered for `lng` — including those registered while this call is in
   * flight — then resolve. Concurrent and repeated calls share in-flight runs and never re-run a
   * completed loader; a loader registered after an earlier call resolved is awaited by the next one.
   * A language with no loaders resolves at once.
   *
   * Rejects with the first failure once every loader of the pass has settled; the failed loader
   * alone is re-run by the next call.
   */
  loadI18nLanguage: (lng: string) => Promise<void>
  /** Whether every loader registered for `lng` has completed; true for a language with none. */
  isI18nLanguageLoaded: (lng: string) => boolean
}
