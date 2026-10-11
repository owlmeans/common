import type { PluginConfig } from '@owlmeans/config'
import type { InitializedService } from '@owlmeans/context'

/** Google's siteverify answer, for a checkbox (v2) or a score-based (v3) token. */
export interface ReCaptchaResponse {
  success: boolean
  /** When the challenge was solved, as an ISO date-time string. */
  challenge_ts: string
  /** The host of the page the token was solved on. */
  hostname: string
  /** Score-based keys only: 0.0 (a bot) … 1.0 (a person). */
  score?: number
  /** Score-based keys only: the action the page named when it asked for the token. */
  action?: string
  'error-codes'?: string[]
}

/** The siteverify form: the key's secret, the token the browser got, optionally the browser's IP. */
export interface ReCaptchaRequest {
  secret: string
  response: string
  remoteip?: string
}

/**
 * Asks Google whether a reCAPTCHA token is good. The plugin resolves it by `RECAPTCHA_VERIFIER`, so a
 * test (or a proxy) registers its own under that alias; without one, the default siteverify call runs.
 */
export interface ReCaptchaVerifierService extends InitializedService {
  /**
   * Google's answer for one token. A refusal is an answer (`success: false`), not an error.
   *
   * @throws {AuthUnavailable} when Google cannot be asked or answers something unreadable.
   */
  verify: (request: ReCaptchaRequest) => Promise<ReCaptchaResponse>
}

/** The one call the default verifier makes — `fetch`, or a stand-in a test injects. */
export interface ReCaptchaFetch {
  (url: string, init: RequestInit): Promise<Response>
}

export interface ReCaptchaVerifierOptions {
  /** The siteverify address; must be https. Default `RECAPTCHA_SITEVERIFY_URL`. */
  url?: string
  /** Default: the global `fetch`. */
  fetch?: ReCaptchaFetch
  /** Milliseconds before the call is abandoned. Default `RECAPTCHA_VERIFY_TIMEOUT`. */
  timeout?: number
}

/**
 * The `MOD_RECAPTCHA` plugin record of the server config: the secret in `value` plus the policy.
 * Every policy field is a string as a mounted config file delivers it; `''` or absent = no check.
 */
export interface ReCaptchaPluginConfig extends PluginConfig {
  /** Hosts a token may be solved on, comma- or space-separated; a subdomain of an entry passes. */
  hostnames?: string
  /** The lowest score a score-based token may carry (0…1); a checkbox token has none and passes. */
  minScore?: string | number
  /** The actions a token may be issued for, comma- or space-separated; a token naming none fails. */
  actions?: string
}

/** The policy one `MOD_RECAPTCHA` record states, applied to Google's answer. */
export interface ReCaptchaPolicyModel {
  readonly record: ReCaptchaPluginConfig
  /** The allowed hosts, lowercased; empty = any host. */
  hostnames: () => string[]
  /**
   * The lowest accepted score, or `null` for no score check.
   *
   * @throws {PluginMissconfigured} when the record's value is not a number between 0 and 1.
   */
  minScore: () => number | null
  /** The allowed actions; empty = any action. */
  actions: () => string[]
  /**
   * Accept Google's answer or refuse it, in this order: success, hostname, score, action.
   *
   * @throws {AuthenFailed} `recaptcha:<error-codes>`, `recaptcha:hostname`, `recaptcha:score`,
   *   `recaptcha:action`.
   */
  assert: (response: ReCaptchaResponse) => void
}
