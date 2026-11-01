import type { CaptchaLoadErrorReason } from './types.js'

/** The captcha could not give a token; `reason` says which step failed. */
export class CaptchaLoadError extends Error {
  public readonly reason: CaptchaLoadErrorReason

  constructor(reason: CaptchaLoadErrorReason, message: string = `captcha:${reason}`, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CaptchaLoadError'
    this.reason = reason
  }
}
