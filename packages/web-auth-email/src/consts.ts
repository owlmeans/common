import { EMAIL_AUTH_OFFER, EMAIL_LOGIN_METHOD } from '@owlmeans/auth-email'
import type { AuthMethodMeta } from '@owlmeans/client-auth/manager/plugins'

/**
 * The library-tier i18n resource this package's own strings live in (`lib : auth-email.*`).
 *
 * An application overrides any of them by registering the same resource at the app tier, in the
 * library namespace — see the README.
 */
export const EMAIL_AUTH_I18N = 'auth-email'

/**
 * The library resource `@owlmeans/client-auth/login` fills with the sign-in screen's copy. This
 * package adds one key to it — `login.method.email`, the chooser button's label.
 */
export const AUTH_I18N = 'auth'

/** Where the browser keeps its e-mail sign-in device id (`localStorage`). */
export const EMAIL_DEVICE_STORAGE = 'owlmeans:auth-email:device'

/** Where a PIN sign-in's one-use "set a password" offer ticket waits for the offer step (`sessionStorage`). */
export const EMAIL_OFFER_STORAGE = 'owlmeans:auth-email:offer'

/** Random bytes in a device id: 16 bytes are 22 base64url characters (`EMAIL_DEVICE_ID_PATTERN`). */
export const EMAIL_DEVICE_ID_BYTES = 16

/** `LoginStep.alias` of the post-sign-in password offer — the same name as its screen's route. */
export const EMAIL_OFFER_LOGIN_STEP = EMAIL_AUTH_OFFER

/**
 * Below the marketing-consent step (which declares none, so `0`): a Terms confirmation and the
 * consent choices come first, the optional password offer last.
 */
export const EMAIL_OFFER_STEP_PRIORITY = -10

/**
 * How the e-mail method presents itself on the sign-in chooser. `appendEmailLogin({ method })`
 * merges over it, and `cfg.security.auth.login.overrides.email` over both.
 */
export const EMAIL_LOGIN_METHOD_META: Readonly<AuthMethodMeta> = Object.freeze({
  id: EMAIL_LOGIN_METHOD,
  i18nKey: EMAIL_LOGIN_METHOD,
  icon: 'mail',
  order: 20,
  emphasis: 'secondary',
})

/** Google's documents the reCAPTCHA notice links to (the badge itself is hidden). */
export const RECAPTCHA_PRIVACY_URL = 'https://policies.google.com/privacy'
export const RECAPTCHA_TERMS_URL = 'https://policies.google.com/terms'

/** Where "Powered by OwlMeans" leads, as on the chooser card. */
export const OWLMEANS_URL = 'https://owlmeans.com'
