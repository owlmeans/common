import type { AuthCredentials } from '@owlmeans/auth'
import type { AbstractRequest } from '@owlmeans/entrypoint'

/** A captcha guest token that passed every check but the spend. */
export interface CaptchaGuest {
  /**
   * The credential the auth manager signed: `GUEST_ID`, role Guest, type Captcha, stamped with the
   * auth service record's id. It names nobody.
   */
  credential: AuthCredentials
  /** The server-issued challenge the token carries — the key it is spent under in `AUTH_CACHE`. */
  challenge: string
  /** When the token stops being accepted. */
  expiresAt: Date
}

/** Anything that carries request headers: an entrypoint request, or a raw Fastify request. */
export interface CaptchaCarrier extends Partial<Pick<AbstractRequest, 'headers'>> {}

/**
 * The checks of a captcha guest token (`Authorization: CAPTCHA <token>`), bound to the context whose
 * `TRUSTED` record `cfg.auth.authKey` (default `AUTH_SRV_KEY`) signed it and whose `AUTH_CACHE`
 * spends it.
 */
export interface CaptchaTokenHelper {
  /**
   * The guest a request carries, checked WITHOUT spending: envelope type, signature by the auth
   * service key, TTL (at most `AUTHEN_TIMEFRAME`), the auth record's stamp, type Captcha, role Guest,
   * `GUEST_ID`, a server-issued challenge. Made for a pre-parse check (before a body is read); the
   * route itself still needs the guard, which spends.
   *
   * @returns `null` for a request without such a header or with a token that fails a check.
   * @throws {SyntaxError} when the context has no trusted record of its auth key (a configuration fault).
   */
  inspect: (req: CaptchaCarrier) => Promise<CaptchaGuest | null>
  /** {@link inspect} for a bare token (the value after `CAPTCHA `). */
  verify: (token: string) => Promise<CaptchaGuest | null>
  /**
   * Spend the token: an atomic create-once of its challenge in `AUTH_CACHE` (Redis `SET NX` in a
   * backend context), under the same key a bearer exchange and the IAM finalizer claim.
   *
   * @returns `false` when the token was spent before.
   * @throws {AuthUnavailable} when the cache cannot answer.
   */
  spend: (guest: CaptchaGuest) => Promise<boolean>
}
