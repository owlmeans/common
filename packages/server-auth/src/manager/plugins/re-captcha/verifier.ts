/**
 * The default reCAPTCHA verifier (one form POST to Google's siteverify) under its names in this
 * package: `createCaptchaVerifierService` / `appendCaptchaVerifierService` of `@owlmeans/captcha`.
 */
export {
  appendCaptchaVerifierService as appendReCaptchaVerifierService,
  createCaptchaVerifierService as createReCaptchaVerifierService,
} from '@owlmeans/captcha'
