/** The part of Google's `grecaptcha` (v3, `render=<site key>`) the loader uses. */
export interface Grecaptcha {
  ready: (callback: () => void) => void
  execute: (siteKey: string, options: { action: string }) => PromiseLike<string>
}

/** The window as the loader reads it: only Google's global. */
export interface CaptchaWindow {
  grecaptcha?: Grecaptcha
}

/** The document as the loader uses it: one script and one style appended to its head. */
export interface CaptchaDocument extends Pick<Document, 'createElement' | 'querySelector' | 'head'> {}

/**
 * Why a captcha could not give a token: the script failed to `load`, did not become ready in time
 * (`timeout`), there is no page or no API to use (`unavailable`), or Google gave no token (`execute`).
 */
export type CaptchaLoadErrorReason = 'load' | 'timeout' | 'execute' | 'unavailable'

export interface CaptchaLoaderOptions {
  /** Add the document style that hides Google's badge. Default `true`. */
  hideBadge?: boolean
  /** Milliseconds the script may take to become ready. Default `CAPTCHA_LOAD_TIMEOUT`. */
  loadTimeout?: number
  /** Milliseconds one `execute` may take. Default `CAPTCHA_EXECUTE_TIMEOUT`. */
  executeTimeout?: number
  /** The script address `?render=<site key>` is added to. Default `RECAPTCHA_SCRIPT_URL`. */
  scriptUrl?: string
  /** The page to load into. Default: the global `document`, read at call time. */
  document?: CaptchaDocument
  /** Where Google's global appears. Default: the global `window`, read at call time. */
  window?: CaptchaWindow
}

/** Google's reCAPTCHA v3, loaded on first use — never at import. */
export interface CaptchaLoader {
  /**
   * Inject `api.js?render=<siteKey>` once per key (and, unless disabled, the document style that
   * hides Google's badge); resolves once `grecaptcha` is ready. A failure is forgotten, so the next
   * call injects again.
   *
   * @throws {CaptchaLoadError} `load`, `timeout` or `unavailable`.
   */
  prepare: (siteKey: string) => Promise<void>
  /**
   * A fresh token for `action`, loading the script first when needed.
   *
   * @throws {CaptchaLoadError} what `prepare` throws, or `execute` when Google gives no token in time.
   */
  token: (siteKey: string, action: string) => Promise<string>
}
