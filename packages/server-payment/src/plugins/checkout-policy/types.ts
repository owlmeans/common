import type { AmountPolicyView } from '@owlmeans/payment'
import type { CheckoutPlugin } from '../../types.js'

/** What a narrowed amount policy and the plugins' declarations allow a checkout — pure. */
export interface CheckoutPolicyHelper {
  /**
   * Refuse an amount the narrowed view does not allow: any amount while `blocked`, else one above
   * the narrowed maximum.
   *
   * @throws CheckoutLimitExceeded (409)
   */
  assertAmountAllowed: (view: AmountPolicyView, amountMinor: number) => void
  /**
   * The session lifetime: the smallest `sessionTtlSeconds` any plugin declares, clamped to Stripe's
   * 30 minutes – 24 hours; `undefined` when none declares one (Stripe's own default).
   */
  sessionTtlOf: (plugins: readonly CheckoutPlugin[]) => number | undefined
}
