import type {
  CaptchaFetch, CaptchaPolicyModel, CaptchaPolicyRecord, CaptchaRequest, CaptchaResponse, CaptchaVerifierOptions,
  CaptchaVerifierService,
} from '@owlmeans/captcha'

/** Google's siteverify answer — `CaptchaResponse` of `@owlmeans/captcha`. */
export interface ReCaptchaResponse extends CaptchaResponse {}

/** The siteverify form — `CaptchaRequest` of `@owlmeans/captcha`. */
export interface ReCaptchaRequest extends CaptchaRequest {}

/**
 * Asks Google whether a reCAPTCHA token is good — `CaptchaVerifierService` of `@owlmeans/captcha`.
 * The plugin resolves it by `RECAPTCHA_VERIFIER`, so a test (or a proxy) registers its own under
 * that alias; without one, the default siteverify call runs.
 */
export interface ReCaptchaVerifierService extends CaptchaVerifierService {}

/** The one call the default verifier makes — `CaptchaFetch` of `@owlmeans/captcha`. */
export interface ReCaptchaFetch extends CaptchaFetch {}

/** The default verifier's options — `CaptchaVerifierOptions` of `@owlmeans/captcha`. */
export interface ReCaptchaVerifierOptions extends CaptchaVerifierOptions {}

/**
 * The `MOD_RECAPTCHA` plugin record of the server config: the secret in `value` plus the policy —
 * `CaptchaPolicyRecord` of `@owlmeans/captcha`. Every policy field is a string as a mounted config
 * file delivers it; `''` or absent = no check.
 */
export interface ReCaptchaPluginConfig extends CaptchaPolicyRecord {}

/** The policy one `MOD_RECAPTCHA` record states — `CaptchaPolicyModel` of `@owlmeans/captcha`. */
export interface ReCaptchaPolicyModel extends CaptchaPolicyModel {}
