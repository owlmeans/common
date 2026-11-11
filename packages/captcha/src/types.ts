import type { PluginConfig } from '@owlmeans/config'
import type { LazyService } from '@owlmeans/context'

/** What a provider may weigh besides the token itself. */
export interface CaptchaVerifyOptions {
  /** The action the caller expects the token to have been issued for. */
  action?: string
  /** The browser's IP address, when the caller knows it. */
  remoteIp?: string
}

/**
 * A provider's answer for one token, in the terms every captcha policy judges: whether the provider
 * accepted the token, and what it says about it.
 */
export interface CaptchaVerdict {
  /** The provider accepted the token. */
  success: boolean
  /** Score-based providers only: 0.0 (a bot) … 1.0 (a person); absent for a challenge-only answer. */
  score?: number
  /** The action the token was issued for, when the provider reports one. */
  action?: string
  /** The host of the page the token was solved on, when the provider reports it. */
  hostname?: string
  /** When the challenge was solved (ISO date-time), when the provider reports it. */
  at?: string
  /** The provider's own refusal codes, for a token it did not accept. */
  errors?: string[]
}

/** What a browser needs to solve a provider's captcha: the provider's id and the public site key. */
export interface CaptchaClientSettings {
  /** The id of the provider — the browser picks its client by it. */
  provider: string
  /** The public key the browser asks the provider with; `''` when none is configured. */
  siteKey: string
}

/**
 * One captcha provider: the server half of a captcha service, registered in the context's captcha
 * host (`ensureCaptchaService(ctx).register(provider)`). A provider package exports a factory for it
 * and an `append*` helper that registers it; nothing registers a provider as a side effect.
 */
export interface CaptchaProvider {
  /** The provider's id — what settings, the `MOD_CAPTCHA` record and a browser client name it by. */
  id: string
  /**
   * The provider's verdict on one token. A refused token is a verdict (`success: false`), never an
   * error.
   *
   * @throws {AuthUnavailable} `captcha:config` when the provider holds no key to ask with; `captcha`
   *   when the provider cannot be asked or answers something unreadable.
   */
  verify: (token: string, options?: CaptchaVerifyOptions) => Promise<CaptchaVerdict>
  /** The settings a browser needs; the site key is `''` while none is configured. */
  clientSettings: () => CaptchaClientSettings
}

/**
 * The context's captcha host: the providers by id. Reached with `ensureCaptchaService(ctx)` while a
 * context is set up; consumers resolve a provider through `captchaResolverOf(ctx)`, which never
 * registers anything.
 */
export interface CaptchaService extends LazyService {
  /** Add a provider; a provider of the same id is replaced. */
  register: (provider: CaptchaProvider) => void
  /**
   * The provider of `id`; without an id, the only registered provider. `null` when none is
   * registered under `id`, or when no id is given and none or several are registered.
   */
  get: (id?: string | null) => CaptchaProvider | null
  /** Every registered provider, in registration order. */
  list: () => CaptchaProvider[]
}

/**
 * The host record `MOD_CAPTCHA` of a server config: which provider judges the captcha guest sign-in
 * of `@owlmeans/server-auth` and its lenient policy. Declaring it is what turns that sign-in on; it
 * holds no secret — keys are the provider's own records or options. Every policy field is a string as
 * a mounted config file delivers it; `''` or absent = no check.
 */
export interface CaptchaPolicyRecord extends PluginConfig {
  /** The provider id; absent = the only registered provider. */
  provider?: string
  /** Hosts a token may be solved on, comma- or space-separated; a subdomain of an entry passes. */
  hostnames?: string
  /** The lowest score a score-based token may carry (0…1); an answer without a score passes. */
  minScore?: string | number
  /** The actions a token may be issued for, comma- or space-separated; a token naming none fails. */
  actions?: string
}

/** The lenient policy one `CaptchaPolicyRecord` states, applied to a provider's verdict. */
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
   * Accept a verdict or refuse it, in this order: success, hostname, score, action.
   *
   * @throws {AuthenFailed} `captcha:<errors>` / `captcha:unknown`, `captcha:hostname`,
   *   `captcha:score`, `captcha:action`.
   */
  assert: (verdict: CaptchaVerdict) => void
}

/**
 * Reads the captcha host of a context without ever registering one — what a check, a sign-in plugin
 * or a boot-time validation uses once the context is set up.
 */
export interface CaptchaResolver {
  /** The provider of `id` (without an id: the only registered one), or `null`. */
  find: (id?: string | null) => CaptchaProvider | null
  /**
   * {@link find}, or a configuration fault: captcha is configured but no registered provider fits.
   *
   * @throws {PluginMissconfigured} `captcha:provider:<id | any>`, logged once with a clear reason.
   */
  provider: (id?: string | null) => CaptchaProvider
  /** The `MOD_CAPTCHA` record of the context's config, or `null` when it declares none. */
  record: () => CaptchaPolicyRecord | null
  /**
   * The boot check of the captcha guest sign-in: a declared `MOD_CAPTCHA` record must name a
   * registered provider. Without the record it passes.
   *
   * @throws {PluginMissconfigured} as {@link provider} does.
   */
  assertReady: () => void
}

/**
 * The strict check a route runs before it acts: which provider, the hosts a token may be solved on
 * and the lowest score. `null` settings turn the check off; once settings are given, nothing is
 * optional. Keys (secret, site key) are the provider's, never settings.
 */
export interface CaptchaSettings {
  /** The provider id; absent = the only registered provider. */
  provider?: string
  /** Hosts a token may be solved on — a list, or a comma/space-separated string; never empty. */
  hostnames?: string[] | string
  /** The lowest accepted score, 0…1 — a number or a numeric string. */
  minScore?: number | string
}

/** One call's captcha: the browser's token, the action the call expects, the caller's IP. */
export interface CaptchaCheckRequest {
  token?: string | null
  /** The exact action the token must have been issued for. */
  action: string
  remoteIp?: string
}

/**
 * The strict check a route runs on a score-based token before it acts: no sign-in, no guest token,
 * nothing spent — the provider's verdict is judged in place.
 */
export interface CaptchaCheck {
  /** True when settings are given (the check is on). */
  enabled: () => boolean
  /**
   * What a browser needs to solve the captcha, or `null` while the check is off.
   *
   * @throws {PluginMissconfigured} when the check is on and no registered provider fits.
   */
  clientSettings: () => CaptchaClientSettings | null
  /**
   * The boot check: on, the provider the settings name must be registered. Off, it passes.
   *
   * @throws {PluginMissconfigured} `captcha:provider:<id | any>`.
   */
  assertReady: () => void
  /**
   * Resolve when the token passes; a disabled check always resolves.
   *
   * Refusals, in this order: `captcha:missing` (no token), `captcha:<errors>` / `captcha:unknown`
   * (the provider's own), `captcha:score` (no score, or below `minScore`), `captcha:hostname`,
   * `captcha:action` (not exactly `request.action`).
   *
   * @throws {AuthenFailed} for a refused token.
   * @throws {AuthUnavailable} `captcha:config` when on but no provider fits, the provider has no site
   *   key, or the hostnames or the score floor are missing or invalid; whatever the provider throws
   *   when it cannot be asked (`captcha`, `captcha:config`).
   */
  assert: (request: CaptchaCheckRequest) => Promise<void>
}
