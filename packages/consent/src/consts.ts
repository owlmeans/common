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

/**
 * The DOM event `applyConsent` dispatches on `window` after it finishes writing globals and
 * pushing the Consent Mode update.
 *
 * A loader that already ran (a gate script that decided, on first paint, not to load yet) has no
 * other way to hear a LATER grant — Consent Mode itself speaks only on `window.dataLayer`, which a
 * tag that has not loaded is not listening to. `event.detail.record` carries the record that was
 * just applied.
 */
export const CONSENT_EVENT = 'owlmeans:consent'

export const CONSENT_ESSENTIAL = 'essential'
export const CONSENT_FUNCTIONAL = 'functional'
export const CONSENT_ANALYTICS = 'analytics'
export const CONSENT_MARKETING = 'marketing'

/**
 * The DOM event the store dispatches on `window` when a language that arrived with a link (or an
 * explicit choice made before the visitor answered the dialog) has just become storable — the
 * visitor granted functional storage — so the application can switch to it now instead of at the
 * next load. `detail: { language }`. An application that resolves its language from storage at
 * start-up (`@owlmeans/client-i18n`) listens for it.
 */
export const CONSENT_LANGUAGE_EVENT = 'owlmeans:language'

/**
 * The `window` property the inline `<head>` fragment leaves a carried language on when it may not
 * store it yet (no decision, or functional not granted): memory only, never storage. The store
 * picks it up at `init` and writes it if — and only if — the visitor later grants functional storage
 * in this page's life. Fixed for the same reason `CONSENT_SETUP_FLAG` is: two bundles, one page.
 */
export const CONSENT_PENDING_LANGUAGE = 'cookieConsentPendingLanguage'

/**
 * Where an application persists an explicit interface-language choice — `@owlmeans/client-i18n`'s
 * `owlmeans-lng`. Repeated here rather than imported: this package has no runtime dependencies, and
 * the linker's language part has to run in an inline `<head>` script, before any bundle exists.
 */
export const CONSENT_LANGUAGE_KEY = 'owlmeans-lng'

export const CONSENT_LOCALES = ['en', 'pl', 'ru', 'be', 'uk', 'es', 'de', 'fr'] as const

export type ConsentLocale = (typeof CONSENT_LOCALES)[number]

/**
 * The categories every OwlMeans surface starts with.
 *
 * What owlmeans.com already asked (analytics, marketing) plus the essential row, which the original
 * widget left implicit — making it explicit is what lets a flow require an acknowledgement before
 * it sets a session cookie, and what tells a visitor what is being stored regardless — plus
 * functional, the visitor's own remembered preferences.
 */
export const DEFAULT_CONSENT_CATEGORIES: ConsentCategory[] = [
  {
    key: CONSENT_ESSENTIAL, required: true,
    labelKey: 'essential', descriptionKey: 'essentialDesc',
    globalVar: 'owlConsentEssential',
    signals: ['security_storage', 'functionality_storage'],
  },
  // A preference the visitor set — today the interface language — remembered on their device. Not
  // essential (nothing breaks without it) and not tracking, so it drives NO Consent Mode signal:
  // a signal would make `trackingGranted` count it, and a visitor who only allowed their language
  // to be remembered would load the tag container.
  {
    key: CONSENT_FUNCTIONAL,
    labelKey: 'functional', descriptionKey: 'functionalDesc',
    globalVar: 'owlConsentFunctional',
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
