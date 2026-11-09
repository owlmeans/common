/**
 * The one-use "set a password" offer tickets a PIN sign-in hands out, each bound to its account for
 * `EMAIL_OFFER_TTL_SECONDS`. A store keeps a digest of the ticket, never the ticket itself.
 */
export interface EmailOfferTickets {
  /** A new random ticket (32 bytes, base64url) bound to `accountId`. */
  issue: (accountId: string) => Promise<string>
  /**
   * Spend a ticket atomically: `true` once, for the account it is bound to. A ticket presented by
   * another account is refused and stays unspent; an expired or spent one is refused.
   */
  spend: (ticket: string, accountId: string) => Promise<boolean>
}

/** A clock in milliseconds (`Date.now`). */
export interface EmailClock {
  (): number
}
