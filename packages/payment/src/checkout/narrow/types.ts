import type { AmountCheckoutPolicy, AmountNarrowing, AmountPolicyView } from '../../types.js'
import type { NarrowAmountPolicyOptions } from '../types.js'

/** An amount policy narrowed for one entity, and the amounts it still allows. */
export interface AmountNarrowingHelper {
  /**
   * An amount policy narrowed for one entity — the one computation the server's refusal and the
   * dialog's control share, so a disabled control and a refusal cannot disagree.
   *
   * - The maximum is the smallest of the base maximum and every narrowing's; the reason, reset and
   *   remaining come from the narrowing that set it (the first on a tie).
   * - Presets above the maximum are dropped; the default is clamped into `[minimum, maximum]`.
   * - `limit` is `null` when no narrowing lowered the base maximum.
   * - `blocked` (`limit.maximumMinor < base.minimumMinor`) means NO amount may be bought now. The
   *   returned `policy` then stays a VALID policy pinned to the minimum (maximum = default =
   *   minimum, no presets above it), so a validator never throws on it; the UI disables the input
   *   and the confirm button on `limit.blocked`, and the server refuses every amount with
   *   `CheckoutLimitExceeded` — neither may read the pinned policy as "the minimum is allowed".
   *
   * @throws PaymentError (`checkout-policy:*`) when the base policy itself is invalid.
   */
  narrowAmountPolicy: (
    base: AmountCheckoutPolicy, narrowings: AmountNarrowing[], opts?: NarrowAmountPolicyOptions,
  ) => AmountPolicyView
  /** Whether an amount may be bought under a narrowed view: never when blocked. */
  amountAllowed: (view: AmountPolicyView, amountMinor: number) => boolean
}
