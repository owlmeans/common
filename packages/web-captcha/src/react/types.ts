import type { CaptchaLoader } from '../types.js'

export interface UseCaptchaOptions {
  /** The site key the server advertised; `null` (or `''`) = captcha off. */
  siteKey: string | null
  /** The exact action the server checks this form's token for. */
  action: string
  /** Default: the shared `captchaLoader`. */
  loader?: CaptchaLoader
}

export interface UseCaptchaResult {
  /** The script is ready for the site key — or the captcha is off. */
  ready: boolean
  /** The last load or execute failure, cleared by the next success. */
  error: Error | null
  /**
   * A fresh token for the action, or `null` while the captcha is off.
   *
   * @throws {CaptchaLoadError} when the script cannot load or Google gives no token.
   */
  execute: () => Promise<string | null>
}
