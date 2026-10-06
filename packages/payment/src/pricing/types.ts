import type { AmountCheckoutPolicy, QuantityCheckoutPolicy } from '../types.js'

/** The checkout policies' invariants and the charge an amount grosses up to. */
export interface CheckoutPricingHelper {
  /** @throws PaymentError (`checkout-policy:amount`, `checkout-policy:presets`) for an invalid policy. */
  assertAmountCheckoutPolicy: (policy: AmountCheckoutPolicy) => AmountCheckoutPolicy
  /** @throws PaymentError (`checkout-policy:quantity`) for an invalid policy. */
  assertQuantityCheckoutPolicy: (policy: QuantityCheckoutPolicy) => QuantityCheckoutPolicy
  /** @throws PaymentError (`checkout-amount:*`) for an amount the policy does not allow. */
  assertCheckoutAmount: (policy: AmountCheckoutPolicy, amountMinor: number) => number
  /** Gross up a net credit value so the configured adjustment remains outside the credit grant. */
  chargeAmountMinor: (amountMinor: number, policy: Pick<AmountCheckoutPolicy, 'fixedMinor' | 'rateBps'>) => number
}
