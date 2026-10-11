import { MARKETING_CONSENT_I18N as DOMAIN_I18N } from '@owlmeans/marketing-consent'

/** The client-side marketing-consent service alias (`context.service<MarketingConsentClientService>(...)`). */
export const MARKETING_CONSENT_CLIENT_SERVICE = 'marketing-consent-client'

/** `LoginStep.alias` — the post-sign-in step this package registers with `@owlmeans/client-auth`. */
export const MARKETING_CONSENT_LOGIN_STEP = 'marketing-consent'

/** `LoginLandingHook.alias` — records a fresh terms acceptance once, per landed token. */
export const MARKETING_CONSENT_LANDING_HOOK_TERMS = 'marketing-consent:terms'

/**
 * Where a browser records that THIS sign-in already skipped the marketing-consent step.
 *
 * Keyed by the sign-in's own session id (or the raw token when none), never a digest — it never
 * leaves the browser, mirroring `@owlmeans/client-auth/login`'s `LOGIN_LANDED_STORAGE`. A skip is
 * therefore honoured for the rest of THIS sign-in (a `/dispatcher` revisit included) and forgotten
 * the moment a new one starts, which is what "shown again at the next sign-in" means.
 */
export const MARKETING_CONSENT_SKIP_STORAGE = '_owlmeans-marketing-consent-skipped'

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

/**
 * The i18n resource `@owlmeans/client-auth/login` registers its `login.terms.*` strings under
 * (`addI18nLib(lng, 'auth', ...)` — no constant exported for it there; `@owlmeans/web-panel`'s own
 * `LoginTerms` wiring hardcodes the same literal). The Terms box and the privacy notice this
 * package renders on the consent screen read THIS resource, never `MARKETING_CONSENT_I18N` — those
 * are the sign-in screen's own sentences, reused here verbatim so the wording never forks between
 * the two places a person might see them.
 */
export const AUTH_I18N = 'auth'
