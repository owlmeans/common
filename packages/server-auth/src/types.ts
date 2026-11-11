import type { Auth, AuthToken } from '@owlmeans/auth'
import type { GuardService } from '@owlmeans/entrypoint'
import type { ResourceRecord } from '@owlmeans/resource'
import type { ServerConfig } from '@owlmeans/server-context'

export interface AuthService extends GuardService {
  authenticate: (token: AuthToken) => Promise<AuthToken>
  unpack: (token: string) => Promise<Auth>
}

export interface AuthServiceAppend {
  auth: () => AuthService
}

export interface AuthSpent extends ResourceRecord {
}

/**
 * The keys and session lifetime of ONE deployment's authentication (`cfg.auth`). Every field is
 * optional and its default is what this package always did, so a deployment that sets nothing is
 * unchanged. A deployment that sets them keeps what it signs apart from every other: nothing minted
 * under one pair of keys verifies under another.
 */
export interface AuthServiceSettings {
  /**
   * The `TRUSTED` record name that signs this service's bearer tokens and verifies them in the guard
   * (`handle`, `unpack`). Default: `cfg.alias ?? cfg.service`. The service's own identity for
   * signed service-to-service requests stays `cfg.alias ?? cfg.service` whatever this says.
   */
  tokenKey?: string
  /**
   * The `TRUSTED` record name of the auth manager: it signs the sign-in challenges, the credential
   * envelopes and captcha guest tokens, and the bearer exchange and the captcha guard verify them
   * with it. Default: `AUTH_SRV_KEY` (`'auth-service'`).
   */
  authKey?: string
  /**
   * The absolute lifetime of a bearer session, in milliseconds. Default: `AUTH_SESSION_TTL` (seven
   * days). The session registry clamps anything longer to seven days.
   */
  sessionTtl?: number
}

/** A server config carrying this package's per-deployment settings. */
export interface AuthServiceConfig extends ServerConfig {
  auth?: AuthServiceSettings
}
