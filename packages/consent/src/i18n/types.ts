import type { ConsentLocale } from '../types.js'

/** The dialog's built-in copy: the locale it is read in, the house translate shape, placeholders. */
export interface ConsentI18nHelper {
  /** A locale reduced to one the built-in copy carries — its base tag, else `en`. */
  normalizeLocale: (locale?: string) => ConsentLocale
  /** `(key, defaultValue) => string`, the house shape, backed by the built-in bundle. */
  defaultConsentTranslate: (locale?: string) => (key: string, defaultValue: string) => string
  /** Substitute `{{name}}` placeholders. Enough for the two the policy page needs. */
  interpolate: (text: string, values: Record<string, string | number>) => string
}
