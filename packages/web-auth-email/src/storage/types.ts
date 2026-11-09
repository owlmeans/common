/** The part of a Web Storage this package uses. */
export interface EmailStorageArea extends Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {}

export interface EmailStorageHelperOptions {
  /** Where the device id lives. Default: `window.localStorage`, or nothing when it is unavailable. */
  local?: () => EmailStorageArea | null
  /** Where the offer ticket waits. Default: `window.sessionStorage`, or nothing when it is unavailable. */
  session?: () => EmailStorageArea | null
  /** `count` random bytes. Default: `crypto.getRandomValues`. */
  random?: (count: number) => Uint8Array
  /** The clock, in milliseconds. Default: `Date.now`. */
  now?: () => number
}

/** The offer ticket as it is kept — with the account it was issued to and when it stops counting. */
export interface StoredEmailOffer {
  ticket: string
  owner?: string
  expiresAt: number
}

/**
 * What a browser keeps for e-mail sign-in: its device id, and a fresh PIN sign-in's offer ticket.
 *
 * Every storage access tolerates a browser that refuses site data (private modes, blocked
 * storage): the device id then lives for the page alone, and no offer is shown.
 */
export interface EmailStorageHelper {
  /**
   * This browser's device id — 16 random bytes, base64url (22 characters). Created on first use and
   * kept in `localStorage`; without storage, one id for as long as this page lives.
   */
  deviceId: () => string
  /**
   * The waiting offer ticket, or null — also when it has expired, or was issued to another account
   * than `owner` (when both are known).
   */
  offer: (owner?: string) => string | null
  /** Keep a PIN sign-in's offer ticket for the offer step, until `EMAIL_OFFER_TTL_SECONDS` pass. */
  keepOffer: (ticket: string, owner?: string) => void
  /** Forget the offer ticket — it was used, declined, or cannot be used any more. */
  dropOffer: () => void
}
