import type { EmailThrottleRuleName } from '../types.js'

/** The throttles of e-mail sign-in over the deployment's `AuthThrottleService`. */
export interface EmailAuthThrottle {
  /**
   * Count one event of `rule` for `subject` (an address, a client IP, an account id, `global`).
   * A no-op without a throttle service, with an empty rule list or without a subject.
   *
   * @throws {OtpThrottled} 429 with `retryAfter` seconds.
   */
  consume: (rule: EmailThrottleRuleName, subject: string | null | undefined) => Promise<void>
}
