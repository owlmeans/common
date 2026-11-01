/**
 * The reCAPTCHA constants now live in `@owlmeans/captcha`; these are their names in this package.
 *
 * - `RECAPTCHA_VERIFIER` (= `CAPTCHA_VERIFIER`, `'re-captcha-verifier'`) — the service alias the
 *   reCAPTCHA plugin resolves its verifier by.
 * - `RECAPTCHA_SITEVERIFY_URL` — Google's siteverify endpoint, always https.
 * - `RECAPTCHA_VERIFY_TIMEOUT` — how long the default verifier waits for Google, in ms.
 */
export {
  CAPTCHA_VERIFIER as RECAPTCHA_VERIFIER, RECAPTCHA_SITEVERIFY_URL, RECAPTCHA_VERIFY_TIMEOUT,
} from '@owlmeans/captcha'
