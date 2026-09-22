import { MARKETING_CONSENT_I18N as DOMAIN_I18N } from '@owlmeans/marketing-consent'

/** The client-side marketing-consent service alias (`context.service<MarketingConsentClientService>(...)`). */
export const MARKETING_CONSENT_CLIENT_SERVICE = 'marketing-consent-client'

/** `LoginStep.alias` — the post-sign-in step this package registers with `@owlmeans/client-auth`. */
export const MARKETING_CONSENT_LOGIN_STEP = 'marketing-consent'

/** `LoginLandingHook.alias` — records a fresh terms acceptance once, per landed token. */
export const MARKETING_CONSENT_LANDING_HOOK_TERMS = 'marketing-consent:terms'

/** `LoginLandingHook.alias` — reconciles every registered `MarketingConsentBridge` once, per landed token. */
export const MARKETING_CONSENT_LANDING_HOOK_SYNC = 'marketing-consent:bridges'

/**
 * The i18n resource this package's own screen/preferences strings register under.
 *
 * Deliberately the SAME resource `@owlmeans/marketing-consent` already owns
 * (`MARKETING_CONSENT_I18N`, `'marketing-consent'`) rather than a second one. That domain package
 * ships no UI of its own — only the `group.*`/`consent.*` label and description keys a screen needs
 * — and this package is the ONLY thing that ever renders them, adding its own `screen.*`/
 * `preferences.*` keys alongside them. `addI18nLib` pushes a new resource ENTRY rather than
 * replacing one (`@owlmeans/i18n`'s `_addI18n`/`initI18nResource`), and `client-i18n`'s
 * `useI18nResource` merges every entry for a `(lng, resource, ns)` triple with
 * `i18n.addResourceBundle(lng, ns, data, true, true)` (deep merge) before it is ever read — so two
 * packages contributing DISJOINT top-level keys (`group`/`consent`/`link`/`errors` here vs.
 * `screen`/`preferences` there) combine cleanly into one bundle. A second resource name would only
 * mean a translator has to know "the marketing-consent strings" are split across two files that
 * describe the same feature.
 */
export const MARKETING_CONSENT_I18N = DOMAIN_I18N
