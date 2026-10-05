import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import {
  AmountPolicyViewSchema, PaymentError, amountNarrowingHelper, checkoutPricingHelper,
  consumerReviveHelper,
} from '../src/index.js'
import type { AmountCheckoutPolicy } from '../src/index.js'

const base: AmountCheckoutPolicy = {
  currency: 'usd', minimumMinor: 500, maximumMinor: 50_000, defaultMinor: 2_000,
  presetsMinor: [1_000, 2_000, 5_000, 10_000], fixedMinor: 0, rateBps: 200,
}
const resetsAt = new Date('2026-09-30T12:00:00.000Z')

describe('narrowAmountPolicy', () => {
  test('no narrowing, or none below the base maximum, leaves the policy and no limit', () => {
    expect(amountNarrowingHelper.narrowAmountPolicy(base, [])).toEqual({ policy: base, limit: null })
    expect(amountNarrowingHelper.narrowAmountPolicy(base, [{ maximumMinor: 50_000, reason: 'tier' }, { maximumMinor: 90_000, reason: 'x' }]))
      .toEqual({ policy: base, limit: null })
  })

  test('the maximum is the smallest one; the reason, reset and remaining come from the narrowing that set it', () => {
    const view = amountNarrowingHelper.narrowAmountPolicy(base, [
      { maximumMinor: 10_000, reason: 'window', resetsAt, remainingMinor: 10_000 },
      { maximumMinor: 2_500, reason: 'per-purchase' },
    ], { productSku: 'credits-product', planSku: 'credits-topup' })
    expect(view.policy).toEqual({ ...base, maximumMinor: 2_500, presetsMinor: [1_000, 2_000] })
    expect(view.limit).toEqual({
      productSku: 'credits-product', planSku: 'credits-topup', currency: 'usd', minimumMinor: 500,
      maximumMinor: 2_500, narrowed: true, blocked: false, reason: 'per-purchase',
    })
  })

  test('the default is clamped under a narrowed maximum; the first narrowing wins a tie', () => {
    const view = amountNarrowingHelper.narrowAmountPolicy(base, [
      { maximumMinor: 1_500, reason: 'window', resetsAt, remainingMinor: 1_500 },
      { maximumMinor: 1_500, reason: 'per-purchase' },
    ])
    expect(view.policy.defaultMinor).toBe(1_500)
    expect(view.policy.presetsMinor).toEqual([1_000])
    expect(view.limit).toMatchObject({ reason: 'window', resetsAt, remainingMinor: 1_500 })
  })

  test('blocked below the minimum — the policy stays valid, pinned to the minimum, and nothing is allowed', () => {
    const view = amountNarrowingHelper.narrowAmountPolicy(base, [{ maximumMinor: 0, reason: 'window', resetsAt, remainingMinor: 0 }])
    expect(view.limit).toMatchObject({ blocked: true, narrowed: true, maximumMinor: 0, minimumMinor: 500 })
    expect(view.policy).toEqual({ ...base, maximumMinor: 500, defaultMinor: 500, presetsMinor: [] })
    expect(() => checkoutPricingHelper.assertAmountCheckoutPolicy(view.policy)).not.toThrow()
    expect(amountNarrowingHelper.amountAllowed(view, 500)).toBe(false)
  })

  test('a negative or fractional narrowing reads as its floor at zero', () => {
    expect(amountNarrowingHelper.narrowAmountPolicy(base, [{ maximumMinor: -5, reason: 'hold' }]).limit?.maximumMinor).toBe(0)
    expect(amountNarrowingHelper.narrowAmountPolicy(base, [{ maximumMinor: 999.9, reason: 'x' }]).limit?.maximumMinor).toBe(999)
  })

  test('amountAllowed follows the narrowed policy', () => {
    const view = amountNarrowingHelper.narrowAmountPolicy(base, [{ maximumMinor: 2_500, reason: 'per-purchase' }])
    expect(amountNarrowingHelper.amountAllowed(view, 2_500)).toBe(true)
    expect(amountNarrowingHelper.amountAllowed(view, 2_501)).toBe(false)
    expect(amountNarrowingHelper.amountAllowed(view, 499)).toBe(false)
  })

  test('an invalid base policy is a fault', () => {
    expect(() => amountNarrowingHelper.narrowAmountPolicy({ ...base, defaultMinor: 1 }, [])).toThrow(PaymentError)
  })

  test('crosses the wire as ISO dates and revives', () => {
    const view = amountNarrowingHelper.narrowAmountPolicy(base, [{ maximumMinor: 0, reason: 'window', resetsAt }])
    const wire = JSON.parse(JSON.stringify(view))
    expect(new Ajv({ strict: false, validateFormats: false }).validate(AmountPolicyViewSchema, wire)).toBe(true)
    expect(consumerReviveHelper.reviveAmountPolicyView(wire).limit?.resetsAt).toEqual(resetsAt)
    expect(consumerReviveHelper.reviveAmountPolicyView({ policy: base, limit: null }).limit).toBeNull()
  })
})
