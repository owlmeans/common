import type { PluginConfig } from '@owlmeans/config'
import type { InitializedService } from '@owlmeans/context'

/** Google's siteverify answer, for a checkbox (v2) or a score-based (v3) token. */
export interface CaptchaResponse {
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
export interface CaptchaRequest {
  secret: string
  response: string
  remoteip?: string
}

/**
 * Asks Google whether a reCAPTCHA token is good. Consumers resolve it by `CAPTCHA_VERIFIER`, so a
 * test (or a proxy) registers its own under that alias; without one, the default siteverify call runs.
 */
export interface CaptchaVerifierService extends InitializedService {
  /**
   * Google's answer for one token. A refusal is an answer (`success: false`), not an error.
   *
   * @throws {AuthUnavailable} when Google cannot be asked or answers something unreadable.
   */
  verify: (request: CaptchaRequest) => Promise<CaptchaResponse>
}

/** The one call the default verifier makes — `fetch`, or a stand-in a test injects. */
export interface CaptchaFetch {
  (url: string, init: RequestInit): Promise<Response>
}

export interface CaptchaVerifierOptions {
  /** The siteverify address; must be https. Default `RECAPTCHA_SITEVERIFY_URL`. */
  url?: string
  /** Default: the global `fetch`. */
  fetch?: CaptchaFetch
  /** Milliseconds before the call is abandoned. Default `RECAPTCHA_VERIFY_TIMEOUT`. */
  timeout?: number
}

/**
 * The policy record of the lenient reCAPTCHA sign-in (the `MOD_RECAPTCHA` plugin record of a server
 * config): the secret in `value` plus the policy. Every policy field is a string as a mounted config
 * file delivers it; `''` or absent = no check.
 */
export interface CaptchaPolicyRecord extends PluginConfig {
  /** Hosts a token may be solved on, comma- or space-separated; a subdomain of an entry passes. */
  hostnames?: string
  /** The lowest score a score-based token may carry (0…1); a checkbox token has none and passes. */
  minScore?: string | number
  /** The actions a token may be issued for, comma- or space-separated; a token naming none fails. */
  actions?: string
}

/** The lenient policy one `CaptchaPolicyRecord` states, applied to Google's answer. */
export interface CaptchaPolicyModel {
  readonly record: CaptchaPolicyRecord
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
  assert: (response: CaptchaResponse) => void
}

/**
 * What a strict, challenge-less captcha check runs on: a score-based (v3) key and its policy.
 * An empty `siteKey` turns the check off; every other field is then required.
 */
export interface CaptchaSettings {
  /** The browser's site key; `''` = captcha off. */
  siteKey: string
  /** The siteverify secret. */
  secret: string
  /** Hosts a token may be solved on — a list, or a comma/space-separated string; never empty. */
  hostnames: string[] | string
  /** The lowest accepted score, 0…1 — a number or a numeric string. */
  minScore: number | string
}

/** One call's captcha: the browser's token, the action the call expects, the caller's IP. */
export interface CaptchaCheckRequest {
  token?: string | null
  /** The exact action the token must have been issued for. */
  action: string
  remoteip?: string
}

/**
 * The strict check a route runs on a score-based token before it acts: no sign-in, no guest
 * token, nothing spent — Google's answer is judged in place.
 */
export interface CaptchaCheck {
  /** True when a site key is configured (the check is on). */
  enabled: () => boolean
  /** The site key a browser needs, or `null` when the check is off. */
  siteKey: () => string | null
  /**
   * Resolve when the token passes; a disabled check always resolves.
   *
   * Refusals, in this order: `recaptcha:missing` (no token), `recaptcha:<error-codes>` /
   * `recaptcha:unknown` (Google's own), `recaptcha:score` (no score, or below `minScore`),
   * `recaptcha:hostname`, `recaptcha:action` (not exactly `request.action`).
   *
   * @throws {AuthenFailed} for a refused token.
   * @throws {AuthUnavailable} `recaptcha:config` when enabled but the secret, the hostnames or the
   *   score floor are missing or invalid; `recaptcha` when Google cannot be asked.
   */
  assert: (request: CaptchaCheckRequest) => Promise<void>
}
