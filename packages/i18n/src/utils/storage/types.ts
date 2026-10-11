import type { I18nLanguageLoaders, I18nLanguages } from '../../types.js'

/** Lazily created slots of the process-wide i18n storage and loader registry. */
export interface I18nStorageUtils {
  /** The (ns, resource, language) slot, created empty on first use; `ns` defaults to `translation`. */
  ensureStructure: (lng: string, resource: string, ns?: string) => I18nLanguages[string]
  /** The loader bucket of a language, created empty on first use. */
  ensureLoaders: (lng: string) => I18nLanguageLoaders
}
