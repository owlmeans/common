import { PaymentError } from './errors.js'
import type { AmountCheckoutPolicy, QuantityCheckoutPolicy } from './types.js'

const integer = (value: number): boolean => Number.isSafeInteger(value)

export const assertAmountCheckoutPolicy = (
  policy: AmountCheckoutPolicy,
): AmountCheckoutPolicy => {
  if (
    !integer(policy.minimumMinor)
    || !integer(policy.maximumMinor)
    || !integer(policy.defaultMinor)
    || !integer(policy.fixedMinor)
    || !integer(policy.rateBps)
    || policy.minimumMinor < 0
    || policy.minimumMinor > policy.defaultMinor
    || policy.defaultMinor > policy.maximumMinor
    || policy.fixedMinor < 0
    || policy.rateBps < 0
    || policy.rateBps >= 10_000
    || policy.currency.trim().length !== 3
  ) {
    throw new PaymentError('checkout-policy:amount')
  }

  const presets = new Set(policy.presetsMinor)
  if (
    presets.size !== policy.presetsMinor.length
    || policy.presetsMinor.some(value =>
      !integer(value) || value < policy.minimumMinor || value > policy.maximumMinor
    )
  ) {
    throw new PaymentError('checkout-policy:presets')
  }

  return policy
}

export const assertQuantityCheckoutPolicy = (
  policy: QuantityCheckoutPolicy,
): QuantityCheckoutPolicy => {
  if (
    !integer(policy.minimum)
    || !integer(policy.maximum)
    || !integer(policy.default)
    || policy.minimum < 1
    || policy.minimum > policy.default
    || policy.default > policy.maximum
  ) {
    throw new PaymentError('checkout-policy:quantity')
  }
  return policy
}

export const assertCheckoutAmount = (
  policy: AmountCheckoutPolicy, amountMinor: number,
): number => {
  assertAmountCheckoutPolicy(policy)
  if (!integer(amountMinor)) {
    throw new PaymentError('checkout-amount:integer')
  }
  if (amountMinor < policy.minimumMinor) {
    throw new PaymentError('checkout-amount:minimum')
  }
  if (amountMinor > policy.maximumMinor) {
    throw new PaymentError('checkout-amount:maximum')
  }
  return amountMinor
}

/** Gross up a net credit value so the configured adjustment remains outside the credit grant. */
export const chargeAmountMinor = (
  amountMinor: number, policy: Pick<AmountCheckoutPolicy, 'fixedMinor' | 'rateBps'>,
): number => {
  const adjusted = amountMinor + policy.fixedMinor
  const numerator = adjusted * 10_000
  if (
    !integer(amountMinor) || !integer(policy.fixedMinor) || !integer(policy.rateBps)
    || amountMinor < 0 || policy.fixedMinor < 0 || policy.rateBps < 0 || policy.rateBps >= 10_000
    || !integer(adjusted) || !integer(numerator)
  ) {
    throw new PaymentError('checkout-charge')
  }
  const charge = Math.ceil(numerator / (10_000 - policy.rateBps))
  if (!integer(charge)) throw new PaymentError('checkout-charge')
  return charge
}
