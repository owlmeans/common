import type { AuthCredentials } from '@owlmeans/auth'
import type { AbstractRequest } from '@owlmeans/entrypoint'

/** A reCAPTCHA guest token that passed every check but the spend. */
export interface ReCaptchaGuest {
  /**
   * The credential the auth manager signed: `GUEST_ID`, role Guest, type ReCaptcha, stamped with
   * the auth service record's id. It names nobody.
   */
  credential: AuthCredentials
  /** The server-issued challenge the token carries — the key it is spent under in `AUTH_CACHE`. */
  challenge: string
  /** When the token stops being accepted. */
  expiresAt: Date
}

/** Anything that carries request headers: an entrypoint request, or a raw Fastify request. */
export interface ReCaptchaCarrier extends Partial<Pick<AbstractRequest, 'headers'>> {}

/**
 * The checks of a reCAPTCHA guest token (`Authorization: RE-CAPTCHA <token>`), bound to the context
 * whose `TRUSTED` record `AUTH_SRV_KEY` signed it and whose `AUTH_CACHE` spends it.
 */
export interface ReCaptchaTokenHelper {
  /**
   * The guest a request carries, checked WITHOUT spending: envelope type, signature by the auth
   * service key, TTL (at most `AUTHEN_TIMEFRAME`), the auth record's stamp, type ReCaptcha, role
   * Guest, `GUEST_ID`, a server-issued challenge. Made for a pre-parse check (before a body is read);
   * the route itself still needs the guard, which spends.
   *
   * @returns `null` for a request without such a header or with a token that fails a check.
   * @throws {SyntaxError} when the context has no `AUTH_SRV_KEY` trusted record (a configuration fault).
   */
  inspect: (req: ReCaptchaCarrier) => Promise<ReCaptchaGuest | null>
  /** {@link inspect} for a bare token (the value after `RE-CAPTCHA `). */
  verify: (token: string) => Promise<ReCaptchaGuest | null>
  /**
   * Spend the token: an atomic create-once of its challenge in `AUTH_CACHE` (Redis `SET NX` in a
   * backend context), under the same key a bearer exchange and the IAM finalizer claim.
   *
   * @returns `false` when the token was spent before.
   * @throws {AuthUnavailable} when the cache cannot answer.
   */
  spend: (guest: ReCaptchaGuest) => Promise<boolean>
}
