import type { AmountEstimate, PriceEstimate, PricingPolicy } from '../types.js'

/** The pricing policy's invariants and the tax / local-currency estimate of an amount. */
export interface PriceEstimateHelper {
  /**
   * @throws PaymentError when a tax estimate is served without automatic tax, a currency estimate is
   * served without Adaptive Pricing, or a TTL is not a positive integer.
   */
  assertPricingPolicy: (policy: PricingPolicy) => PricingPolicy
  /**
   * Stripe's `percentage_decimal` (e.g. `"23"`, `"8.875"`) as parts per million — `1_000_000` is
   * `100%` — parsed digit by digit so it is exact where a float parse (`Number(x) * 10_000`) is not.
   * Fractional digits past the fourth are truncated, not rounded: a quarter of a hundredth of a
   * percent is already far finer than any real tax rate.
   *
   * @throws PaymentError when the string is not a plain (unsigned, non-exponential) decimal.
   */
  ratePpmOf: (percentageDecimal: string) => number
  /**
   * Re-derive tax and the local-currency total for `amountMinor` from a `PriceEstimate` already
   * fetched for the SAME product/plan/country, so a UI can re-price a custom amount (the credit
   * dialog) without a second Stripe Tax call ($0.05 each).
   *
   * Exact for `amountMinor === estimate.tax.subtotalMinor` (Stripe's own numbers, echoed back).
   * Otherwise exact only for `TaxBehavior.Exclusive` with `estimate.tax.scalable` — a linear
   * percentage rate scales; a flat fee, a reduced-rate portion, or several inclusive rates do not, and
   * neither does rescaling an inclusive amount (its tax portion is carved OUT of the total by a
   * different formula this helper does not attempt). Both cases return `null` amounts, meaning
   * "computed at checkout".
   *
   * @throws PaymentError when `amountMinor` is not a non-negative safe integer.
   */
  estimateOf: (amountMinor: number, estimate: PriceEstimate) => AmountEstimate
}
