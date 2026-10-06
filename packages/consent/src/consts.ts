import type { ConsentCategory, ConsentLocale } from './types.js'

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
