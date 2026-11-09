import type { BasicConfig } from '@owlmeans/context'
import type { AuthServiceSettings } from '../types.js'

/** What the settings are read from: a context's config, with or without `cfg.auth`. */
export interface AuthSettingsConfig extends Pick<BasicConfig, 'service' | 'alias'> {
  auth?: AuthServiceSettings
}

export interface AuthSettingsTarget {
  cfg: AuthSettingsConfig
}

/**
 * The effective `cfg.auth` of one context — every value with its default applied, read from the
 * config at each call.
 */
export interface AuthSettings {
  /** `cfg.auth.tokenKey`, else `cfg.alias ?? cfg.service`. */
  tokenKey: () => string
  /** `cfg.auth.authKey`, else `AUTH_SRV_KEY`. */
  authKey: () => string
  /**
   * `cfg.auth.sessionTtl`, else `AUTH_SESSION_TTL`.
   *
   * @throws {SyntaxError} `auth:session-ttl` for a value that is not a positive finite number.
   */
  sessionTtl: () => number
}
