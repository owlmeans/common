/** `CaptchaLoadError`'s `name` — recognised by name too, since a second copy of the class fails `instanceof`. */
export const CAPTCHA_LOAD_ERROR = 'CaptchaLoadError'

/** The server's captcha refusal markers: `captcha:<reason>` (`AuthenFailed`), `captcha` / `captcha:config` (`AuthUnavailable`). */
export const CAPTCHA_REFUSAL = /(^|[\s:])captcha(:|\s|$)/
