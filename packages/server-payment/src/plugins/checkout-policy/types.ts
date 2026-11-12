import type { AmountPolicyView } from '@owlmeans/payment'
import type { CheckoutPlugin } from '../../types.js'
import type { PaygateFeatures } from '../../paygate/types.js'

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
   * The session lifetime: the smallest `sessionTtlSeconds` any plugin declares, clamped into the
   * paygate's `bounds` (`features.sessionTtl`); `undefined` when none declares one, or the paygate
   * takes no lifetime (no bounds) — the paygate's own default.
   */
  sessionTtlOf: (plugins: readonly CheckoutPlugin[], bounds?: PaygateFeatures['sessionTtl']) => number | undefined
}
