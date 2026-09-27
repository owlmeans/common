import { describe, expect, test } from 'bun:test'
import {
  ConsumerRightsError, oneTimeWithdrawalRefund, splitByShares, subscriptionWithdrawalRefund,
} from '../src/index.js'
import type { PlanWithdrawalComponent } from '../src/index.js'

const DAY = 86_400_000
const periodStart = new Date('2026-09-01T00:00:00.000Z')
const periodEnd = new Date(periodStart.getTime() + 30 * DAY)

const components: PlanWithdrawalComponent[] = [
  { key: 'services', basis: 'time', shareMinor: 1000 },
  { key: 'credits', basis: 'units', shareMinor: 1000 },
]

describe('splitByShares', () => {
  test('parts are floors of the exact share, the rest to the largest remainders, earlier first on a tie', () => {
    expect(splitByShares(2000, [1000, 1000])).toEqual([1000, 1000])
    expect(splitByShares(1001, [1, 1])).toEqual([501, 500])
    expect(splitByShares(10, [1, 1, 1])).toEqual([4, 3, 3])
    expect(splitByShares(100, [1, 2])).toEqual([33, 67])
    expect(splitByShares(100, [0, 0])).toEqual([50, 50])
    expect(splitByShares(0, [3, 7])).toEqual([0, 0])
    expect(splitByShares(5, [])).toEqual([])
  })

  test('always sums to the total', () => {
    for (const [total, shares] of [[997, [3, 5, 7]], [12345, [1, 1, 1, 1, 1, 1, 1]], [1, [2, 2, 2]]] as Array<[number, number[]]>) {
      expect(splitByShares(total, shares).reduce((a, b) => a + b, 0)).toBe(total)
    }
  })

  test('refuses a negative or fractional amount', () => {
    expect(() => splitByShares(-1, [1])).toThrow(ConsumerRightsError)
    expect(() => splitByShares(1.5, [1])).toThrow(ConsumerRightsError)
  })
})

describe('oneTimeWithdrawalRefund', () => {
  test('the pinned example: 1256 paid, 125k of 500k used → 942', () => {
    expect(oneTimeWithdrawalRefund({ paidMinor: 1256, unitsGranted: 500_000, unitsUsed: 125_000 }))
      .toEqual({ refundMinor: 942, netRatio: 0.75, unitsReturned: 375_000 })
  })

  test('a refund rounds up, a fraction of a used unit rounds down', () => {
    expect(oneTimeWithdrawalRefund({ paidMinor: 1000, unitsGranted: 3, unitsUsed: 1 }).refundMinor).toBe(667)
    expect(oneTimeWithdrawalRefund({ paidMinor: 1000, unitsGranted: 3, unitsUsed: 1.9 }).refundMinor).toBe(667)
  })

  test('nothing used returns everything; everything used returns nothing', () => {
    expect(oneTimeWithdrawalRefund({ paidMinor: 2550, unitsGranted: 2500, unitsUsed: 0 }).refundMinor).toBe(2550)
    expect(oneTimeWithdrawalRefund({ paidMinor: 2550, unitsGranted: 2500, unitsUsed: 9_999 }))
      .toEqual({ refundMinor: 0, netRatio: 0, unitsReturned: 0 })
    expect(oneTimeWithdrawalRefund({ paidMinor: 2550, unitsGranted: 0, unitsUsed: 0 }).refundMinor).toBe(2550)
  })

  test('never refunds more than what is still unrefunded', () => {
    expect(oneTimeWithdrawalRefund({ paidMinor: 1000, refundedMinor: 500, unitsGranted: 3, unitsUsed: 1 }).refundMinor).toBe(500)
    expect(oneTimeWithdrawalRefund({ paidMinor: 1000, refundedMinor: 1200, unitsGranted: 3, unitsUsed: 0 }).refundMinor).toBe(0)
  })
})

describe('subscriptionWithdrawalRefund (PE Digital)', () => {
  test('the pinned example: services 3 of 30 days, credits 100k of 500k → net 1700, gross 2091', () => {
    const result = subscriptionWithdrawalRefund({
      paidMinor: 2460, netMinor: 2000, components, periodStart, periodEnd,
      servicesRequestedAt: periodStart, withdrawnAt: new Date(periodStart.getTime() + 3 * DAY + 3_600_000),
      units: { granted: 500_000, used: 100_000 },
    })
    expect(result).toMatchObject({
      refundMinor: 2091, refundNetMinor: 1700, timeDeductionMinor: 100, unitsDeductionMinor: 200,
      elapsedDays: 3, periodDays: 30, unitsUsed: 100_000, unitsGranted: 500_000,
    })
    expect(result.components.map(component => component.deductionMinor)).toEqual([100, 200])
  })

  test('no start request means no time deduction at all', () => {
    const result = subscriptionWithdrawalRefund({
      paidMinor: 2460, netMinor: 2000, components, periodStart, periodEnd,
      withdrawnAt: new Date(periodStart.getTime() + 10 * DAY), units: { granted: 500_000, used: 100_000 },
    })
    expect(result.timeDeductionMinor).toBe(0)
    expect(result.elapsedDays).toBe(0)
    expect(result.refundNetMinor).toBe(1800)
    expect(result.refundMinor).toBe(2214)
  })

  test('days count from the later of the period start and the start request, floored', () => {
    const result = subscriptionWithdrawalRefund({
      paidMinor: 2000, netMinor: 2000, components, periodStart, periodEnd,
      servicesRequestedAt: new Date(periodStart.getTime() + 2 * DAY),
      withdrawnAt: new Date(periodStart.getTime() + 3 * DAY - 1),
      units: { granted: 500_000, used: 0 },
    })
    expect(result.elapsedDays).toBe(0)
    expect(result.refundMinor).toBe(2000)
  })

  test('deductions round down, the gross refund rounds up', () => {
    const result = subscriptionWithdrawalRefund({
      paidMinor: 1230, netMinor: 1000, components: [{ key: 'services', basis: 'time', shareMinor: 1000 }],
      periodStart, periodEnd, servicesRequestedAt: periodStart, withdrawnAt: new Date(periodStart.getTime() + DAY),
    })
    // floor(1000 / 30) = 33 → net 967 → ceil(1230 × 967 / 1000) = ceil(1189.41) = 1190
    expect(result.timeDeductionMinor).toBe(33)
    expect(result.refundMinor).toBe(1190)
  })

  test('without declared components the whole price is time; a unit component without units deducts nothing', () => {
    const whole = subscriptionWithdrawalRefund({
      paidMinor: 3000, netMinor: 3000, periodStart, periodEnd,
      servicesRequestedAt: periodStart, withdrawnAt: new Date(periodStart.getTime() + 15 * DAY),
    })
    expect(whole.components).toEqual([{ key: 'price', basis: 'time', shareMinor: 3000, amountMinor: 3000, deductionMinor: 1500 }])
    expect(whole.refundMinor).toBe(1500)

    const noUnits = subscriptionWithdrawalRefund({
      paidMinor: 2000, netMinor: 2000, components, periodStart, periodEnd, withdrawnAt: periodEnd,
    })
    expect(noUnits.unitsDeductionMinor).toBe(0)
    expect(noUnits.refundMinor).toBe(2000)
  })

  test('shares that do not sum to the net split it by largest remainder', () => {
    const result = subscriptionWithdrawalRefund({
      paidMinor: 1001, netMinor: 1001, components, periodStart, periodEnd, withdrawnAt: periodStart,
    })
    expect(result.components.map(component => component.amountMinor)).toEqual([501, 500])
  })

  test('caps at what is still unrefunded', () => {
    expect(subscriptionWithdrawalRefund({
      paidMinor: 2460, refundedMinor: 2000, netMinor: 2000, components, periodStart, periodEnd, withdrawnAt: periodStart,
    }).refundMinor).toBe(460)
  })
})
