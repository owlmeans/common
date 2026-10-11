import type { OneTimeRefund, OneTimeRefundInput, SubscriptionRefund, SubscriptionRefundInput } from '../types.js'

/** The refund a withdrawal owes, computed in BigInt and rounded in the consumer's favour. */
export interface WithdrawalRefundHelper {
  /**
   * Split `totalMinor` in proportion to `shares` by the largest remainder: every part is the floor
   * of its exact share, and the units left over go one each to the largest fractional parts (the
   * earlier part on a tie). The parts always sum to the total. All-zero shares split evenly.
   */
  splitByShares: (totalMinor: number, shares: number[]) => number[]
  /**
   * The refund of a one-time purchase (prepaid credits):
   * `min(paid − refunded, ceil(paid × (granted − used) / granted))`. Nothing granted means nothing
   * performed — the whole unrefunded amount. 1256 paid, 125 000 of 500 000 used → 942.
   */
  oneTimeWithdrawalRefund: (input: OneTimeRefundInput) => OneTimeRefund
  /**
   * The refund of a subscription's first invoice (CJEU C-641/19 PE Digital). The net price splits
   * into its components by `shareMinor` (largest remainder). A `time` component loses
   * `floor(c × elapsedDays / periodDays)`, the days counted from `max(periodStart,
   * servicesRequestedAt)` and floored — and nothing without a start request. A `units` component
   * loses `floor(c × used / granted)`. The gross refund is `ceil(paid × refundNet / net)`, capped at
   * what is still unrefunded. Net 2000 / paid 2460, services 1000 at 3 of 30 days (−100), credits
   * 1000 with 100 000 of 500 000 used (−200) → net 1700, gross 2091.
   */
  subscriptionWithdrawalRefund: (input: SubscriptionRefundInput) => SubscriptionRefund
}
