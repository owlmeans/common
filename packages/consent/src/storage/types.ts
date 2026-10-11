import type { ConsentOptions, ConsentRecord } from '../types.js'

/** Where a visitor's choice is kept: localStorage first, the cookie second. */
export interface ConsentStorageHelper {
  /**
   * Bring a stored record up to the current shape.
   *
   * A record with no `v` was written before the essential category existed, when it was implicitly
   * always granted. The visitor DID choose; upgrading in place honours that choice, where treating
   * the record as unusable would re-prompt everyone who has ever visited.
   */
  migrateConsent: (raw: ConsentRecord | null) => ConsentRecord | null
  /**
   * What this browser has already chosen, or null.
   *
   * localStorage first and the cookie second, because that is the order the widget this generalises
   * used and the two can disagree: a visitor who cleared site data but kept cookies still has an
   * answer, and asking them again would be wrong.
   */
  readConsent: (opts?: ConsentOptions) => ConsentRecord | null
  /**
   * Record the choice in both places.
   *
   * Two stores rather than one because neither is reliable alone: localStorage is cleared by "clear
   * site data" while the cookie survives it, and the cookie is refused where third-party storage is
   * blocked while localStorage may not be.
   */
  writeConsent: (record: ConsentRecord, opts?: ConsentOptions) => void
  /** Forget the choice in both places. */
  clearConsent: (opts?: ConsentOptions) => void
}
