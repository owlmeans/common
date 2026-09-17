import { describe, expect, test } from 'bun:test'
import {
  LimitKind, LimitWindow, PlanDuration, PlanStatus, SubscriptionStatus, capabilityViewsOf,
  entitlementViewOf, limitViewsOf, promoActive, promoViewOf, reviveEntitlementView,
} from '../src/index.js'
import type { EntitlementPlanView, ProductPlan } from '../src/index.js'

const until = new Date('2026-10-01T00:00:00.000Z')
const before = new Date('2026-09-15T00:00:00.000Z')
const after = new Date('2026-10-15T00:00:00.000Z')

describe('promos', () => {
  test('no promo is always in force', () => {
    expect(promoActive(undefined, undefined, after)).toBe(true)
    expect(promoViewOf(undefined, undefined, after)).toBeUndefined()
  })

  test('a promo ends AT until, not after it', () => {
    expect(promoActive({ until }, null, new Date(until.getTime() - 1))).toBe(true)
    expect(promoActive({ until }, null, until)).toBe(false)
  })

  test('grandfathering keeps it for a subscription created before until — and only then', () => {
    const promo = { until, grandfather: true }
    expect(promoActive(promo, before, after)).toBe(true)
    expect(promoActive(promo, until, after)).toBe(false)
    expect(promoActive(promo, null, after)).toBe(false)
    expect(promoActive({ until }, before, after)).toBe(false)
  })

  test('the view says whether it is kept for the plan', () => {
    expect(promoViewOf({ until, grandfather: true }, before, after))
      .toEqual({ until, grandfathered: true, active: true })
    expect(promoViewOf({ until }, before, after)).toEqual({ until, grandfathered: false, active: false })
  })
})

const plan: ProductPlan = {
  productSku: 'pro', sku: 'pro-monthly', status: PlanStatus.Active, duration: PlanDuration.Monthly,
  price: 20, title: 'Pro', rank: 10,
  capabilities: [
    { scope: 'feature', permissions: { whitelabel: true, legacy: false, unset: null } },
    { scope: 'feature', permissions: { 'custom-domain': true }, promo: { until } },
  ],
  limits: {
    seats: { kind: LimitKind.Occupancy, limit: 3, unit: 'seat' },
    exports: { kind: LimitKind.Window, window: LimitWindow.Day, limit: 5 },
    imports: { kind: LimitKind.Lifetime, limit: 1, promo: { until } },
  },
}

describe('capability views', () => {
  test('one row per granted permission; false and null are not listed', () => {
    const rows = capabilityViewsOf(plan, null, before)
    expect(rows.map(row => row.param)).toEqual(['feature:whitelabel', 'feature:custom-domain'])
    expect(rows.every(row => row.granted)).toBe(true)
  })

  test('a lapsed promo ungrants but still lists the capability', () => {
    const domain = capabilityViewsOf(plan, null, after).find(row => row.permission === 'custom-domain')
    expect(domain).toMatchObject({ granted: false, promo: { active: false, grandfathered: false } })
  })

  test('a set under the reserved limit scope is not a capability', () => {
    expect(capabilityViewsOf({ capabilities: [{ scope: 'limit', permissions: { seats: 3 } }] })).toEqual([])
  })
})

describe('limit views', () => {
  const at = new Date('2026-09-15T10:00:00.000Z')

  test('used comes from the current window; a missing row is zero', () => {
    const rows = limitViewsOf(plan, [
      { key: 'exports', window: '2026-09-14', used: 5 },
      { key: 'exports', window: '2026-09-15', used: 2 },
      { key: 'seats', window: 'occupancy', used: 1 },
    ], null, at)
    expect(rows.find(row => row.key === 'exports')).toMatchObject({ used: 2, remaining: 3, param: 'limit:exports' })
    expect(rows.find(row => row.key === 'seats')).toMatchObject({ used: 1, remaining: 2, unit: 'seat' })
    expect(rows.find(row => row.key === 'imports')).toMatchObject({ used: 0, remaining: 1 })
  })

  test('only a window limit carries its bounds', () => {
    const rows = limitViewsOf(plan, [], null, at)
    expect(rows.find(row => row.key === 'exports')).toMatchObject({
      window: LimitWindow.Day,
      windowStart: new Date('2026-09-15T00:00:00.000Z'),
      resetsAt: new Date('2026-09-16T00:00:00.000Z'),
    })
    expect(rows.find(row => row.key === 'seats')).not.toHaveProperty('resetsAt')
  })

  test('remaining floors at zero when the counter over-counts', () => {
    const seats = limitViewsOf(plan, [{ key: 'seats', window: 'occupancy', used: 7 }], null, at)
      .find(row => row.key === 'seats')
    expect(seats).toMatchObject({ limit: 3, used: 7, remaining: 0 })
  })

  test('a lapsed promo makes the limit zero', () => {
    expect(limitViewsOf(plan, [], null, after).find(row => row.key === 'imports'))
      .toMatchObject({ limit: 0, remaining: 0, promo: { active: false } })
  })
})

const planView: EntitlementPlanView = {
  sku: 'pro-monthly', productSku: 'pro', title: 'Pro', rank: 10, free: false,
  status: SubscriptionStatus.Active, paygate: 'stripe', subscriptionId: 'sub_1',
  subscribedAt: before, periodEnd: after,
}

describe('the entitlement view', () => {
  test('promos are measured against the subscription date on the plan view', () => {
    const grandfathered: ProductPlan = {
      ...plan, capabilities: [{ scope: 'feature', permissions: { beta: true }, promo: { until, grandfather: true } }],
    }
    const view = entitlementViewOf(grandfathered, planView, [], after)
    expect(view.capabilities[0]).toMatchObject({ granted: true, promo: { grandfathered: true } })
    expect(entitlementViewOf(grandfathered, { ...planView, subscribedAt: undefined }, [], after)
      .capabilities[0].granted).toBe(false)
    expect(view.at).toBe(after)
  })

  test('the wire form revives into dates', () => {
    const view = entitlementViewOf(plan, planView, [], before)
    const revived = reviveEntitlementView(JSON.parse(JSON.stringify(view)))
    expect(revived).toEqual(view)
    expect(revived.limits.find(row => row.key === 'exports')?.resetsAt).toBeInstanceOf(Date)
    expect(reviveEntitlementView(view)).toEqual(view)
  })
})
