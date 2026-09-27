import { describe, expect, test } from 'bun:test'
import {
  assertPricingPolicy, DEFAULT_PRICING_POLICY, estimateOf, ratePpmOf, TaxBehavior, TaxEstimateStatus,
  TaxType, type PriceEstimate, type PricingPolicy,
} from '../src/index.js'

describe('ratePpmOf', () => {
  test('parses a whole percentage', () => {
    expect(ratePpmOf('23')).toBe(230_000)
  })

  test('parses a trailing zero the same as none', () => {
    expect(ratePpmOf('23.0')).toBe(230_000)
  })

  test('parses fractional percentages exactly, without float drift', () => {
    expect(ratePpmOf('8.875')).toBe(88_750)
    expect(ratePpmOf('25.5')).toBe(255_000)
  })

  test('parses a zero rate', () => {
    expect(ratePpmOf('0.0')).toBe(0)
  })

  test('rejects a non-decimal string', () => {
    expect(() => ratePpmOf('abc')).toThrow()
    expect(() => ratePpmOf('1e3')).toThrow()
    expect(() => ratePpmOf('-1')).toThrow()
  })
})

const plVat: PriceEstimate = {
  country: 'PL', source: 'request', currency: 'usd', behavior: TaxBehavior.Exclusive,
  tax: {
    status: TaxEstimateStatus.Taxed, subtotalMinor: 1_021, taxMinor: 235, totalMinor: 1_256,
    scalable: true,
    rates: [{ type: TaxType.Vat, percentage: '23', ratePpm: 230_000, country: 'PL' }],
  },
}

describe('estimateOf', () => {
  test('echoes the reference amount exactly, as Stripe returned it (1021 -> 235 -> 1256)', () => {
    const result = estimateOf(1_021, plVat)
    expect(result).toEqual({ subtotalMinor: 1_021, taxMinor: 235, totalMinor: 1_256 })
  })

  test('rescales an exclusive, scalable rate to a different amount', () => {
    // 3_750 * 23% = 862.5 -> rounds up to 863
    const result = estimateOf(3_750, plVat)
    expect(result.taxMinor).toBe(863)
    expect(result.totalMinor).toBe(4_613)
  })

  test('rounds a half-cent up', () => {
    // 100 * 23% = 23.0 exactly, no rounding ambiguity; use a value that lands on .5
    // 50 * 23% = 11.5 -> rounds to 12
    const result = estimateOf(50, plVat)
    expect(result.taxMinor).toBe(12)
  })

  test('returns null amounts for a different amount when the estimate is not scalable', () => {
    const flat: PriceEstimate = {
      ...plVat,
      tax: { ...plVat.tax, scalable: false },
    }
    expect(estimateOf(3_750, flat)).toEqual({ subtotalMinor: 3_750, taxMinor: null, totalMinor: null })
    // the reference amount is still exact even when not scalable
    expect(estimateOf(1_021, flat)).toEqual({ subtotalMinor: 1_021, taxMinor: 235, totalMinor: 1_256 })
  })

  test('never rescales an inclusive amount away from the reference, even when scalable', () => {
    const inclusive: PriceEstimate = { ...plVat, behavior: TaxBehavior.Inclusive }
    expect(estimateOf(1_021, inclusive)).toEqual({ subtotalMinor: 1_021, taxMinor: 235, totalMinor: 1_256 })
    expect(estimateOf(3_750, inclusive)).toEqual({ subtotalMinor: 3_750, taxMinor: null, totalMinor: null })
  })

  test('carries the subtotal, tax and total in the local currency alongside a rescaled amount', () => {
    const withLocal: PriceEstimate = { ...plVat, local: { currency: 'pln', exchangeRate: 0.25 } }
    // $10.21 / $2.35 / $12.56, each divided by 0.25 usd-per-pln -> 40.84 / 9.40 / 50.24
    const result = estimateOf(1_021, withLocal)
    expect(result.local).toEqual({ currency: 'pln', subtotalAmount: 40.84, taxAmount: 9.4, totalAmount: 50.24 })
  })

  test('rejects a negative or non-integer amount', () => {
    expect(() => estimateOf(-1, plVat)).toThrow()
    expect(() => estimateOf(1.5, plVat)).toThrow()
  })
})

describe('assertPricingPolicy', () => {
  test('accepts the default policy', () => {
    expect(assertPricingPolicy(DEFAULT_PRICING_POLICY)).toBe(DEFAULT_PRICING_POLICY)
  })

  test('rejects a tax estimate without automatic tax', () => {
    const policy: PricingPolicy = { tax: { automatic: false, collectTaxId: false, estimate: true }, currency: { estimate: false } }
    expect(() => assertPricingPolicy(policy)).toThrow()
  })

  test('rejects a currency estimate without adaptive pricing', () => {
    const policy: PricingPolicy = {
      tax: { automatic: true, collectTaxId: true, estimate: false },
      currency: { estimate: true },
    }
    expect(() => assertPricingPolicy(policy)).toThrow()
  })

  test('accepts a currency estimate declared alongside adaptive pricing', () => {
    const policy: PricingPolicy = {
      tax: { automatic: true, collectTaxId: true, estimate: true },
      currency: { adaptive: true, estimate: true },
    }
    expect(assertPricingPolicy(policy)).toBe(policy)
  })

  test('rejects a non-positive or fractional TTL', () => {
    const base: PricingPolicy = { tax: { automatic: true, collectTaxId: true, estimate: false }, currency: { estimate: false } }
    expect(() => assertPricingPolicy({ ...base, tax: { ...base.tax, estimateTtlSeconds: 0 } })).toThrow()
    expect(() => assertPricingPolicy({ ...base, tax: { ...base.tax, estimateTtlSeconds: 1.5 } })).toThrow()
  })
})
