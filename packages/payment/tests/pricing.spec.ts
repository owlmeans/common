import { describe, expect, test } from 'bun:test'
import { type AmountCheckoutPolicy, checkoutPricingHelper } from '../src/index.js'

const policy: AmountCheckoutPolicy = {
  currency: 'usd', minimumMinor: 500, maximumMinor: 50_000, defaultMinor: 1_000,
  presetsMinor: [1_000, 2_000, 5_000, 10_000], fixedMinor: 0, rateBps: 200,
}

describe('amount checkout pricing', () => {
  test('accepts exact boundaries and custom cents', () => {
    expect(checkoutPricingHelper.assertCheckoutAmount(policy, 500)).toBe(500)
    expect(checkoutPricingHelper.assertCheckoutAmount(policy, 501)).toBe(501)
    expect(checkoutPricingHelper.assertCheckoutAmount(policy, 50_000)).toBe(50_000)
  })

  test('rejects values outside the net-credit bounds', () => {
    expect(() => checkoutPricingHelper.assertCheckoutAmount(policy, 499)).toThrow()
    expect(() => checkoutPricingHelper.assertCheckoutAmount(policy, 50_001)).toThrow()
  })

  test('grosses ten dollars up to ten dollars and twenty-one cents', () => {
    expect(checkoutPricingHelper.chargeAmountMinor(1_000, policy)).toBe(1_021)
  })

  test('rejects invalid policy ordering, duplicate presets, and a 100% rate', () => {
    expect(() => checkoutPricingHelper.assertAmountCheckoutPolicy({ ...policy, defaultMinor: 100 })).toThrow()
    expect(() => checkoutPricingHelper.assertAmountCheckoutPolicy({ ...policy, presetsMinor: [1_000, 1_000] })).toThrow()
    expect(() => checkoutPricingHelper.assertAmountCheckoutPolicy({ ...policy, rateBps: 10_000 })).toThrow()
  })
})
