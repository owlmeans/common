import type { ConsentCategory, ConsentLocale, ConsentState } from './types.js'

import en from './i18n/en.json' with { type: 'json' }
import pl from './i18n/pl.json' with { type: 'json' }
import ru from './i18n/ru.json' with { type: 'json' }
import be from './i18n/be.json' with { type: 'json' }
import uk from './i18n/uk.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }
import de from './i18n/de.json' with { type: 'json' }
import fr from './i18n/fr.json' with { type: 'json' }

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
export const CONSENT_ANALYTICS = 'analytics'
export const CONSENT_MARKETING = 'marketing'

/**
 * Where an application persists an explicit interface-language choice — `@owlmeans/client-i18n`'s
 * `owlmeans-lng`. The interface language is strictly necessary storage (the visitor asked for it by
 * choosing it), so it is written whatever the cookie decision says and no category governs it.
 * Repeated here rather than imported: this package has no runtime dependencies, and the linker's
 * language part has to run in an inline `<head>` script, before any bundle exists.
 */
export const CONSENT_LANGUAGE_KEY = 'owlmeans-lng'

export const CONSENT_LOCALES = ['en', 'pl', 'ru', 'be', 'uk', 'es', 'de', 'fr'] as const satisfies readonly ConsentLocale[]

/**
 * The dialog's copy, in the box.
 *
 * Carried here rather than registered into an i18n framework because one of the three consumers is
 * an Astro site with React islands and no OwlMeans i18n at all — and a consent dialog that renders
 * raw keys is worse than no dialog. An application that HAS translations passes `translate` and
 * overrides every one of these.
 */
export const DEFAULT_CONSENT_MESSAGES: Record<ConsentLocale, Record<string, string>> = {
  en, pl, ru, be, uk, es, de, fr,
}

/**
 * The categories every OwlMeans surface starts with.
 *
 * What owlmeans.com already asked (analytics, marketing) plus the essential row, which the original
 * widget left implicit — making it explicit is what lets a flow require an acknowledgement before
 * it sets a session cookie, and what tells a visitor what is being stored regardless: the consent
 * record itself and the interface language the visitor picked.
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

/** The URL parameter a decorated link carries the decision in, absent an override. */
export const CONSENT_LINK_PARAM = 'owlcc'

/** How old a decorated link's timestamp may be and still be trusted, in seconds, absent an override. */
export const CONSENT_LINK_MAX_AGE = 300

/** Clock skew allowed the OTHER way — a timestamp up to this far in the future is still trusted. */
export const CONSENT_LINK_SKEW = 60

/**
 * Where prior consent for non-essential cookies is the law: the EU and EEA (ePrivacy Art. 5(3) with
 * the GDPR), including the parts of member states that carry an ISO code of their own — Åland and
 * the French outermost regions (French Guiana, Guadeloupe, Martinique, Réunion, Mayotte,
 * Saint-Martin). The Canary Islands, Azores, Madeira, Ceuta and Melilla report their state's code.
 * Greece is `GR`, as Cloudflare and every ISO feed spell it.
 */
export const CONSENT_COUNTRIES_GDPR: readonly string[] = Object.freeze([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
  'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
  'AX', 'GF', 'GP', 'MQ', 'RE', 'YT', 'MF',
  'IS', 'LI', 'NO',
])

/**
 * Jurisdictions outside the EEA whose rule for cookies is the same prior opt-in, by statute or by
 * the regulator's guidance (2026):
 *
 * - the United Kingdom (PECR — the 2025 Data (Use and Access) Act exempts some first-party
 *   analytics, advertising still needs consent), the Crown Dependencies and Gibraltar;
 * - Switzerland (FDPIC guidelines, 2025: explicit consent for tracking and profiling);
 * - Andorra, Monaco, San Marino and the Vatican; Türkiye (KVKK cookie guide); Serbia (ZZPL and the
 *   electronic-communications law); Albania, Bosnia and Herzegovina, Montenegro, North Macedonia,
 *   Kosovo, Moldova, Georgia and Ukraine (GDPR-modelled laws);
 * - territories under a member state's regulator but outside the EU: the Faroe Islands and
 *   Greenland (Denmark); Saint-Barthélemy, Saint-Pierre-et-Miquelon, New Caledonia, French
 *   Polynesia, Wallis and Futuna (France); the Caribbean Netherlands.
 */
export const CONSENT_COUNTRIES_ALIGNED: readonly string[] = Object.freeze([
  'GB', 'GG', 'JE', 'IM', 'GI',
  'CH',
  'AD', 'MC', 'SM', 'VA', 'TR', 'RS', 'AL', 'BA', 'ME', 'MK', 'XK', 'MD', 'GE', 'UA',
  'FO', 'GL', 'BL', 'PM', 'NC', 'PF', 'WF', 'BQ',
])

/**
 * Prior opt-in regimes elsewhere (2026): Brazil (LGPD, ANPD cookie guide), Canada (Québec's Law 25
 * — the country is the finest grain a CDN reports, so all of Canada), China (PIPL), South Korea
 * (PIPA), Nigeria (NDPA), Saudi Arabia (PDPL), Thailand (PDPA), Vietnam (PDPL 2026).
 *
 * Deliberately absent: India (the DPDP Act's consent rules apply from mid-2027 — add `IN` then),
 * and the notice-or-opt-out regimes — the United States, Japan, Australia, Singapore. South
 * Africa's POPIA is read both ways by the guides and is left out until its regulator says more.
 */
export const CONSENT_COUNTRIES_OPT_IN: readonly string[] = Object.freeze([
  'BR', 'CA', 'CN', 'KR', 'NG', 'SA', 'TH', 'VN',
])

/**
 * Every country where a located visitor is ASKED (`ConsentGeoOptions.countries` replaces it). A
 * visitor located anywhere else gets an automatic decision; one who cannot be located is asked.
 */
export const CONSENT_REQUIRED_COUNTRIES: readonly string[] = Object.freeze([
  ...CONSENT_COUNTRIES_GDPR, ...CONSENT_COUNTRIES_ALIGNED, ...CONSENT_COUNTRIES_OPT_IN,
])

/**
 * Codes that name no country: Cloudflare's `XX` (no data) and `T1` (Tor), the retired MaxMind
 * pseudo-codes (`A1` anonymous proxy, `A2` satellite, `O1` other) and the continent buckets some
 * feeds fall back to (`EU`, `AP`), plus `ZZ` (unknown). A visitor reported with one is asked.
 */
export const CONSENT_GEO_UNKNOWN: readonly string[] = Object.freeze([
  'XX', 'T1', 'A1', 'A2', 'O1', 'EU', 'AP', 'ZZ',
])

/** Cloudflare's trace endpoint — served by the edge on every proxied host, `loc=` among its lines. */
export const CONSENT_TRACE_PATH = '/cdn-cgi/trace'

/** How long locating may take before the visitor is asked anyway, in ms. */
export const CONSENT_GEO_TIMEOUT = 2500

/**
 * How long an automatic decision is trusted, in seconds. Older, it counts as undecided — in the
 * head scripts as much as in the store — until the visitor is located again, so a grant derived in
 * one country never reaches a page opened an hour later in another.
 */
export const CONSENT_AUTO_MAX_AGE = 3600

/** The state of a store nobody has initialised — and the only server-side snapshot. */
export const CONSENT_IDLE_STATE: ConsentState = Object.freeze({
  record: null, open: false, reason: null, locating: null,
})

/**
 * The attribute on `<html>` that mirrors the consent phase: `locating`, `open`, `decided` or `idle`.
 * Absent until the store first runs. A test waits on it, and a stylesheet may key on it.
 */
export const CONSENT_STATE_ATTRIBUTE = 'data-consent'
