/**
 * The service alias a captcha verifier is resolved by — the reCAPTCHA sign-in plugin of
 * `@owlmeans/server-auth` and `makeCaptchaCheck` alike. A test (or a proxy) registers its own
 * verifier under it; without one the default siteverify call runs.
 */
export const CAPTCHA_VERIFIER = 're-captcha-verifier'

/** Google's siteverify endpoint — always https. */
export const RECAPTCHA_SITEVERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'

/** How long the default verifier waits for Google, in ms. */
export const RECAPTCHA_VERIFY_TIMEOUT = 10_000

/** The provider id a server advertises for an invisible, score-based reCAPTCHA v3 key. */
export const CAPTCHA_PROVIDER_RECAPTCHA_V3 = 'recaptcha-v3'
