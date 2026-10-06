import { PaymentError } from './errors.js'
import { TaxBehavior } from './consts.js'
import type { PriceEstimate, PricingPolicy, AmountEstimate } from './types.js'
import type { PriceEstimateHelper } from './estimate/types.js'

/** Stripe's own convention for a tax amount: half a unit rounds up. */
const roundHalfUp = (value: number): number => Math.floor(value + 0.5)

export const createPriceEstimateHelper = (): PriceEstimateHelper => {
  const assertPricingPolicy = (policy: PricingPolicy): PricingPolicy => {
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

  const ratePpmOf = (percentageDecimal: string): number => {
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

  const estimateOf = (amountMinor: number, estimate: PriceEstimate): AmountEstimate => {
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

  return { assertPricingPolicy, ratePpmOf, estimateOf }
}

export const priceEstimateHelper = createPriceEstimateHelper()

/** @deprecated compat:factory-refactor — use `priceEstimateHelper.assertPricingPolicy(…)` */
export const assertPricingPolicy = (policy: PricingPolicy): PricingPolicy =>
  priceEstimateHelper.assertPricingPolicy(policy)

/** @deprecated compat:factory-refactor — use `priceEstimateHelper.ratePpmOf(…)` */
export const ratePpmOf = (percentageDecimal: string): number => priceEstimateHelper.ratePpmOf(percentageDecimal)

/** @deprecated compat:factory-refactor — use `priceEstimateHelper.estimateOf(…)` */
export const estimateOf = (amountMinor: number, estimate: PriceEstimate): AmountEstimate =>
  priceEstimateHelper.estimateOf(amountMinor, estimate)
