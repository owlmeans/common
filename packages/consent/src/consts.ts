import type { ConsentCategory } from './types.js'

/**
 * Where a visitor's choice is stored.
 *
 * Unchanged from the widget this package generalises, and it must stay unchanged: owlmeans.com has
 * visitors who have already chosen, and a new key would ask every one of them again.
 */
export const CONSENT_KEY = 'site_cookie_consent'

export const CONSENT_COOKIE_DAYS = 365

/**
 * The stored record's shape version.
 *
 * A record with no version predates the explicit `essential` category, when essential storage was
 * implicitly always on. Those records are migrated in place rather than discarded — the visitor
 * made a decision, and re-asking would be a regression they experience as the site forgetting.
 */
export const CONSENT_SCHEMA_VERSION = 2

/** Idempotence flag for the Consent Mode defaults. Fixed: a page may carry two bundles. */
export const CONSENT_SETUP_FLAG = 'cookieConsentSetup'

export const CONSENT_ESSENTIAL = 'essential'
export const CONSENT_ANALYTICS = 'analytics'
export const CONSENT_MARKETING = 'marketing'

export const CONSENT_LOCALES = ['en', 'pl', 'ru', 'be', 'uk', 'es', 'de'] as const

export type ConsentLocale = (typeof CONSENT_LOCALES)[number]

/**
 * The categories every OwlMeans surface starts with.
 *
 * Three, matching what owlmeans.com already asks — plus the essential row, which the original
 * widget left implicit. Making it explicit is what lets a flow require an acknowledgement before
 * it sets a session cookie, and what tells a visitor what is being stored regardless.
 */
export const DEFAULT_CONSENT_CATEGORIES: ConsentCategory[] = [
  {
    key: CONSENT_ESSENTIAL, required: true,
    labelKey: 'essential', descriptionKey: 'essentialDesc',
    globalVar: 'owlConsentEssential',
    signals: ['security_storage', 'functionality_storage'],
  },
  {
    key: CONSENT_ANALYTICS,
    labelKey: 'analytics', descriptionKey: 'analyticsDesc',
    globalVar: 'owlConsentAnalytics',
    signals: ['analytics_storage'],
  },
  {
    key: CONSENT_MARKETING,
    labelKey: 'marketing', descriptionKey: 'marketingDesc',
    globalVar: 'owlConsentMarketing',
    signals: ['ad_storage', 'ad_user_data', 'ad_personalization'],
  },
]

/**
 * Every signal Consent Mode v2 knows, and what it defaults to before anyone has chosen.
 *
 * `security_storage` is granted by Google's own documented recommendation — it covers things like
 * fraud prevention, which are strictly necessary. Everything else starts denied.
 */
export const CONSENT_SIGNAL_DEFAULTS: Record<string, 'granted' | 'denied'> = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  functionality_storage: 'denied',
  personalization_storage: 'denied',
  security_storage: 'granted',
}
