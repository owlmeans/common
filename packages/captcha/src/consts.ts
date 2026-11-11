/** The service alias of the context's captcha host (`ensureCaptchaService`). */
export const CAPTCHA_SERVICE = 'captcha'

/**
 * The host record of a server config (`CaptchaPolicyRecord`): the provider and the lenient policy of
 * the captcha guest sign-in. Declaring it turns that sign-in on; it holds no secret.
 */
export const MOD_CAPTCHA = '_external:captcha'
