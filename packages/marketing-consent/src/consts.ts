import { CONSENT_ANALYTICS, CONSENT_MARKETING } from '@owlmeans/consent'
import type { MarketingConsentDefinition } from './types.js'

// --- Consent keys ------------------------------------------------------------------------------

export const MC_EMAIL = 'marketing.email'
export const MC_SMS = 'marketing.sms'
export const MC_PHONE = 'marketing.phone'
export const MC_PUSH = 'marketing.push'
export const MC_PROFILING = 'data.profiling'
export const MC_PARTNERS = 'data.partners'
export const MC_ANALYTICS = 'trackers.analytics'
export const MC_ADVERTISING = 'trackers.advertising'

// --- Consent groups ------------------------------------------------------------------------------

export const MC_GROUP_COMMUNICATIONS = 'communications'
export const MC_GROUP_DATA = 'data'
export const MC_GROUP_TRACKERS = 'trackers'

/**
 * The wording revision the standard catalogue was last updated at.
 *
 * Bump this (and any `revisedAt` it seeds) whenever the standard wording changes — a person who
 * already answered under an earlier revision is then asked again (`consentStatus`'s `'revised'`
 * status), never silently carried over onto new language.
 */
export const STANDARD_REVISION = '2026-09-22'

/** `'marketing.email'` -> `'consent.marketing.email.label'` — the key's own dots become the i18n
 * path's dots, so the bundle nests exactly as the key reads (`src/i18n/en.json`'s `consent.*`). */
const labelOf = (key: string): string => `consent.${key}.label`
const descriptionOf = (key: string): string => `consent.${key}.description`

/** The 8 standard marketing/data/tracker consents, in their default order. */
export const STANDARD_MARKETING_CONSENTS: MarketingConsentDefinition[] = [
  {
    key: MC_EMAIL,
    group: MC_GROUP_COMMUNICATIONS,
    mode: 'opt-in',
    enabled: true,
    revisedAt: STANDARD_REVISION,
    labelKey: labelOf(MC_EMAIL),
    descriptionKey: descriptionOf(MC_EMAIL),
    order: 10,
  },
  {
    key: MC_SMS,
    group: MC_GROUP_COMMUNICATIONS,
    mode: 'opt-in',
    enabled: true,
    revisedAt: STANDARD_REVISION,
    labelKey: labelOf(MC_SMS),
    descriptionKey: descriptionOf(MC_SMS),
    order: 20,
  },
  {
    key: MC_PHONE,
    group: MC_GROUP_COMMUNICATIONS,
    mode: 'opt-in',
    enabled: true,
    revisedAt: STANDARD_REVISION,
    labelKey: labelOf(MC_PHONE),
    descriptionKey: descriptionOf(MC_PHONE),
    order: 30,
  },
  {
    key: MC_PUSH,
    group: MC_GROUP_COMMUNICATIONS,
    mode: 'opt-in',
    enabled: true,
    revisedAt: STANDARD_REVISION,
    labelKey: labelOf(MC_PUSH),
    descriptionKey: descriptionOf(MC_PUSH),
    order: 40,
  },
  {
    key: MC_PROFILING,
    group: MC_GROUP_DATA,
    mode: 'opt-in',
    enabled: true,
    revisedAt: STANDARD_REVISION,
    labelKey: labelOf(MC_PROFILING),
    descriptionKey: descriptionOf(MC_PROFILING),
    order: 50,
  },
  {
    key: MC_PARTNERS,
    group: MC_GROUP_DATA,
    mode: 'opt-in',
    enabled: true,
    revisedAt: STANDARD_REVISION,
    labelKey: labelOf(MC_PARTNERS),
    descriptionKey: descriptionOf(MC_PARTNERS),
    honorGpc: true,
    order: 60,
  },
  {
    key: MC_ANALYTICS,
    group: MC_GROUP_TRACKERS,
    mode: 'opt-in',
    enabled: true,
    revisedAt: STANDARD_REVISION,
    labelKey: labelOf(MC_ANALYTICS),
    descriptionKey: descriptionOf(MC_ANALYTICS),
    cookieCategory: CONSENT_ANALYTICS,
    order: 70,
  },
  {
    key: MC_ADVERTISING,
    group: MC_GROUP_TRACKERS,
    mode: 'opt-in',
    enabled: true,
    revisedAt: STANDARD_REVISION,
    labelKey: labelOf(MC_ADVERTISING),
    descriptionKey: descriptionOf(MC_ADVERTISING),
    cookieCategory: CONSENT_MARKETING,
    honorGpc: true,
    order: 80,
  },
]

// --- Service / i18n / wire identifiers -----------------------------------------------------

export const MARKETING_CONSENT_SERVICE = 'marketing-consent'
export const MARKETING_CONSENT_I18N = 'marketing-consent'
export const MARKETING_CONSENT_API_PATH = '/marketing-consent'
export const MARKETING_CONSENT_SCREEN_PATH = '/consent/marketing'

// --- Protocol tree aliases -----------------------------------------------------------------

export const MARKETING_CONSENT_BASE = 'marketing-consent'
export const MARKETING_CONSENT_STATUS = 'marketing-consent:status'
export const MARKETING_CONSENT_SAVE = 'marketing-consent:save'
export const MARKETING_CONSENT_TERMS = 'marketing-consent:terms'
export const MARKETING_CONSENT_SCREEN = 'marketing-consent:screen'
