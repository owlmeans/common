import type { ComponentType } from 'react'
import type { CaptchaClient } from '../types.js'

/** What a page hands a provider's interactive widget. */
export interface CaptchaWidgetProps {
  /** The public key the widget asks the provider with. */
  siteKey: string
  /** A solved challenge's token, or `null` when the token expired or the widget was reset. */
  onToken: (token: string | null) => void
  /** The widget is on screen and can be used. */
  onReady?: () => void
  /** The widget could not load or the provider refused to give a token. */
  onError?: (error: Error) => void
  /** The reader's language, when the page knows it. */
  language?: string
}

/**
 * A provider's interactive widget — the slot a sign-in screen renders. A type alias: React's
 * `ComponentType` is a union (a function or a class component), which an interface cannot extend.
 */
export type CaptchaWidget = ComponentType<CaptchaWidgetProps>

/** A captcha client whose widget is a React component. */
export interface CaptchaWidgetClient extends CaptchaClient<CaptchaWidget> {}

export interface UseCaptchaOptions {
  /** The client of the provider the server advertised; `null` = none registered for it. */
  client: CaptchaClient | null | undefined
  /** The site key the server advertised; `null` (or `''`) = captcha off. */
  siteKey: string | null
  /** The exact action the server checks this form's token for. */
  action: string
}

export interface UseCaptchaResult {
  /** The provider is ready for the site key — or the captcha is off. */
  ready: boolean
  /** The last load or execute failure, cleared by the next success. */
  error: Error | null
  /**
   * A fresh token for the action, or `null` while the captcha is off.
   *
   * @throws {CaptchaLoadError} when there is no client for the provider (`unavailable`), its script
   *   cannot load, or it gives no token.
   */
  execute: () => Promise<string | null>
}
