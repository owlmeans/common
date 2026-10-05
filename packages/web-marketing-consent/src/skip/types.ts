/** Whether THIS sign-in skipped the marketing-consent step — the marker the screen's "Skip" leaves. */
export interface MarketingConsentSkipHelper {
  /**
   * Whether THIS sign-in already skipped the step. Read by `pending`; never written by it — only
   * `markSkipped` (the screen's "Skip" action) writes the marker.
   */
  isSkipped: () => Promise<boolean>
  /** Record that THIS sign-in skipped the step. */
  markSkipped: () => Promise<void>
}
