import type { EmailThrottleRuleName } from '../types.js'

/** The non-raw keys e-mail sign-in stores and throttles by, and the form an address is logged in. */
export interface EmailAuthKeyHelper {
  /** The address as every lookup takes it: trimmed, lower-case. */
  normalizeEmail: (email: string) => string
  /** The only part of an address a log may carry. */
  emailDomain: (email: string) => string
  /** A throttle subject (an address, a client IP, an account) as a purpose-bound digest. */
  throttleKey: (rule: EmailThrottleRuleName, subject: string) => string
  /** A remembered device: `sha256("{accountId}:{device}")`, hex. */
  deviceKey: (accountId: string, device: string) => string
  /** The storage key of an offer ticket — a digest, so a store never holds a spendable ticket. */
  ticketKey: (ticket: string) => string
  /**
   * The single-use key a signed sign-in token carries in place of its challenge: a short digest of
   * the plugin's challenge message. The bearer exchange spends it in the auth cache, and it keeps the
   * token inside the shared 1024-character token schema — the wrapped PIN challenge does not fit.
   */
  spendKey: (challenge: string) => string
}
