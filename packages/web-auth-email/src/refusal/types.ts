import type { Translate } from '../types.js'

/**
 * Why an e-mail sign-in or password action did not go through, as the person is told.
 *
 * Server refusals (`throttled`, `code`, `credentials`, `captcha`, `captcha-unavailable`,
 * `unavailable`, `weak`, `offer-expired`, `password-disabled`, `failed`) are read from the error a
 * call rejected with; the rest (`email`, `pin-format`, `password-empty`, `mismatch`, and `weak` for a
 * length the policy refuses anyway) are found before anything is sent.
 */
export type EmailRefusalKind =
  | 'throttled'
  | 'code'
  | 'credentials'
  | 'captcha'
  | 'captcha-unavailable'
  | 'unavailable'
  | 'email'
  | 'pin-format'
  | 'password-empty'
  | 'mismatch'
  | 'weak'
  | 'offer-expired'
  | 'password-disabled'
  | 'failed'

/**
 * Which call was refused — the same status means different things on different calls: a 401 is a
 * wrong code after a PIN and a wrong password after a password sign-in.
 */
export type EmailRefusalContext =
  | 'options'
  | 'send'
  | 'pin'
  | 'password'
  | 'status'
  | 'confirm'
  | 'set'
  | 'remove'
  | 'offer'

export interface EmailRefusal {
  kind: EmailRefusalKind
  /** Seconds until a throttled request may be repeated, when the refusal said so. */
  retryAfter?: number
}

/** Reads a failed call as a refusal and phrases it. */
export interface EmailRefusalHelper {
  /**
   * The refusal an error stands for.
   *
   * A development server sends the typed error (`AuthenFailed('email:password')`, `OtpThrottled`,
   * `EmailPasswordWeak`, `AuthenFailed('recaptcha:score')`…); a production one only the HTTP status
   * and an incident id. Both are read — the type first, then the status in the light of `context` —
   * and anything unrecognised is `failed`, never a guess.
   */
  refusalOf: (error: unknown, context: EmailRefusalContext) => EmailRefusal
  /**
   * The sentence for a refusal in the reader's language. `locale` formats a known waiting time
   * ("in 45 seconds") with `Intl.RelativeTimeFormat`, so no plural rule lives in a translation.
   */
  messageOf: (refusal: EmailRefusal, t: Translate, locale?: string) => string
}
