import { PaymentError } from './errors.js'
import { TaxBehavior } from './consts.js'
import type { PriceEstimate, PricingPolicy } from './types.js'

/**
 * Preserves today's fixed behavior for every consumer that declares no policy: automatic tax and
 * tax-id collection stay on for every checkout (`taxOptions` before this policy existed), no
 * `behavior` is forced onto a synced price, no Adaptive Pricing, and the estimate endpoints are off
 * (a new capability, opt-in only).
 */
export const DEFAULT_PRICING_POLICY: PricingPolicy = Object.freeze({
  tax: Object.freeze({ automatic: true, collectTaxId: true, estimate: false }),
  currency: Object.freeze({ estimate: false }),
}) as PricingPolicy

/**
 * @throws PaymentError when a tax estimate is served without automatic tax, a currency estimate is
 * served without Adaptive Pricing, or a TTL is not a positive integer.
 */
export const assertPricingPolicy = (policy: PricingPolicy): PricingPolicy => {
  if (policy.tax.estimate && !policy.tax.automatic) {
    throw new PaymentError('pricing-policy:tax-estimate-requires-automatic')
  }
  if (policy.currency.estimate && policy.currency.adaptive !== true) {
    throw new PaymentError('pricing-policy:currency-estimate-requires-adaptive')
  }
  for (const ttl of [policy.tax.estimateTtlSeconds, policy.currency.estimateTtlSeconds]) {
    if (ttl != null && (!Number.isSafeInteger(ttl) || ttl < 1)) {
      throw new PaymentError('pricing-policy:ttl')
    }
  }
  return policy
}

/**
 * Stripe's `percentage_decimal` (e.g. `"23"`, `"8.875"`) as parts per million — `1_000_000` is
 * `100%` — parsed digit by digit so it is exact where a float parse (`Number(x) * 10_000`) is not.
 * Fractional digits past the fourth are truncated, not rounded: a quarter of a hundredth of a
 * percent is already far finer than any real tax rate.
 *
 * @throws PaymentError when the string is not a plain (unsigned, non-exponential) decimal.
 */
export const ratePpmOf = (percentageDecimal: string): number => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(percentageDecimal.trim())
  if (match == null) {
    throw new PaymentError('tax-rate:percentage')
  }
  const [, whole, fraction = ''] = match
  const fractionPpm = Number(`${fraction}0000`.slice(0, 4))
  const ppm = Number(whole) * 10_000 + fractionPpm
  if (!Number.isSafeInteger(ppm)) {
    throw new PaymentError('tax-rate:percentage')
  }
  return ppm
}

/** Stripe's own convention for a tax amount: half a unit rounds up. */
const roundHalfUp = (value: number): number => Math.floor(value + 0.5)

export interface AmountEstimate {
  subtotalMinor: number
  /** `null` when `estimate` cannot be rescaled to this amount (see `TaxEstimate.scalable`). */
  taxMinor: number | null
  totalMinor: number | null
  /**
   * The subtotal, tax and total in the country's own currency, in major units — present only
   * alongside a non-`null` `totalMinor`. A UI showing `local` shows ONLY `local` for the tax and
   * total (marked `≈`, since it is Stripe's own rate at read time, not the checkout rate); the
   * integration-currency amounts stay the reference for bookkeeping, never a second figure to show
   * alongside the converted one.
   */
  local?: { currency: string; subtotalAmount: number; taxAmount: number; totalAmount: number }
}

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
export const estimateOf = (amountMinor: number, estimate: PriceEstimate): AmountEstimate => {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new PaymentError('price-estimate:amount')
  }
  const { tax, behavior, local } = estimate
  const sameAmount = amountMinor === tax.subtotalMinor
  const rescalable = sameAmount || (behavior === TaxBehavior.Exclusive && tax.scalable)
  if (!rescalable) {
    return { subtotalMinor: amountMinor, taxMinor: null, totalMinor: null }
  }
  // `sameAmount` trusts Stripe's own numbers outright; otherwise only Exclusive ever reaches here
  // (`rescalable` above excludes an Inclusive amount that differs from the reference).
  const taxMinor = sameAmount ? tax.taxMinor : tax.rates.reduce(
    (sum, rate) => sum + roundHalfUp(amountMinor * rate.ratePpm / 1_000_000), 0,
  )
  const totalMinor = sameAmount ? tax.totalMinor : amountMinor + taxMinor
  const result: AmountEstimate = { subtotalMinor: amountMinor, taxMinor, totalMinor }
  if (local != null) {
    result.local = {
      currency: local.currency,
      subtotalAmount: amountMinor / 100 / local.exchangeRate,
      taxAmount: taxMinor / 100 / local.exchangeRate,
      totalAmount: totalMinor / 100 / local.exchangeRate,
    }
  }
  return result
}
