import { CONSENT_LOCALES } from './consts.js'
import type { ConsentLocale } from './consts.js'

import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }

/**
 * The dialog's copy, in the box.
 *
 * Carried here rather than registered into an i18n framework because one of the three consumers is
 * an Astro site with React islands and no OwlMeans i18n at all — and a consent dialog that renders
 * raw keys is worse than no dialog. An application that HAS translations passes `translate` and
 * overrides every one of these.
 */
export const DEFAULT_CONSENT_MESSAGES: Record<ConsentLocale, Record<string, string>> = {
  en, pl, ru, be, uk, es, de,
}

export const normalizeLocale = (locale?: string): ConsentLocale => {
  const base = (locale ?? 'en').toLowerCase().split('-')[0]

  return CONSENT_LOCALES.includes(base as ConsentLocale) ? base as ConsentLocale : 'en'
}

/** `(key, defaultValue) => string`, the house shape, backed by the built-in bundle. */
export const defaultConsentTranslate = (locale?: string) =>
  (key: string, defaultValue: string): string =>
    DEFAULT_CONSENT_MESSAGES[normalizeLocale(locale)]?.[key] ?? defaultValue

/** Substitute `{{name}}` placeholders. Enough for the two the policy page needs. */
export const interpolate = (text: string, values: Record<string, string | number>): string =>
  text.replace(/\{\{([a-z]+)\}\}/gi, (whole, name: string) =>
    values[name] != null ? String(values[name]) : whole)
