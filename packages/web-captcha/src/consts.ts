/** Google's reCAPTCHA v3 script; `?render=<site key>` selects the invisible, score-based widget. */
export const RECAPTCHA_SCRIPT_URL = 'https://www.google.com/recaptcha/api.js'

/** Marks the script the loader injected; its value is the site key. */
export const CAPTCHA_SCRIPT_ATTRIBUTE = 'data-owlmeans-captcha'

/** Marks the document style that hides Google's badge. */
export const CAPTCHA_STYLE_ATTRIBUTE = 'data-owlmeans-captcha-style'

/**
 * The one document-level rule the loader adds unless told not to: Google's badge hidden. A page
 * that hides it must show Google's notice ("This site is protected by reCAPTCHA…") itself.
 */
export const CAPTCHA_BADGE_CSS = '.grecaptcha-badge{visibility:hidden}'

/** How long the script may take to become ready, in milliseconds. */
export const CAPTCHA_LOAD_TIMEOUT = 15_000

/** How long one `execute` may take, in milliseconds. */
export const CAPTCHA_EXECUTE_TIMEOUT = 20_000
