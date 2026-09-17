import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import {
  CreateCheckoutBodySchema, EntitlementViewSchema, LimitKind, LimitWindow, PlanDuration, PlanStatus,
  PortalFlow, PortalLinkBodySchema, ProductPlanSchema, SubscriptionStatus, entitlementViewOf,
  ENTITLING_STATUSES, TERMINAL_STATUSES,
} from '../src/index.js'
import * as payment from '../src/index.js'
import type { ProductPlan } from '../src/index.js'

const ajv = new Ajv({ strict: false, validateFormats: false })

const plan: ProductPlan = {
  productSku: 'pro-product', sku: 'pro-monthly', status: PlanStatus.Active,
  duration: PlanDuration.Monthly, price: 20, title: 'Pro', rank: 10, gateways: ['stripe'],
  capabilities: [{
    scope: 'feature', permissions: { whitelabel: true },
    promo: { until: new Date('2026-10-01T00:00:00.000Z'), grandfather: true },
  }],
  limits: {
    seats: { kind: LimitKind.Occupancy, limit: 3 },
    exports: { kind: LimitKind.Window, window: LimitWindow.Month, limit: 10, unit: 'file' },
  },
}

describe('statuses', () => {
  test('past-due still entitles; the terminal set does not overlap it', () => {
    expect(ENTITLING_STATUSES).toEqual([SubscriptionStatus.Active, SubscriptionStatus.Trial, SubscriptionStatus.PastDue])
    expect(TERMINAL_STATUSES.some(status => ENTITLING_STATUSES.includes(status))).toBe(false)
    expect(Object.isFrozen(ENTITLING_STATUSES)).toBe(true)
  })

  test('a free tier is a plan and a one-time purchase a fulfillment, never a subscription status', () => {
    expect(Object.values(SubscriptionStatus)).not.toContain('free')
    expect(Object.values(SubscriptionStatus)).not.toContain('consumable')
  })
})

describe('plan declarations', () => {
  const validate = ajv.compile(ProductPlanSchema)

  test('accept rank, free, gateways, promos and limit declarations', () => {
    expect(validate(plan)).toBe(true)
    expect(validate({ ...plan, free: true, price: 0, gateways: [], rank: 0 })).toBe(true)
  })

  test('status is a PLAN status, not a subscription status', () => {
    expect(validate({ ...plan, status: PlanStatus.Hidden })).toBe(true)
    expect(validate({ ...plan, status: SubscriptionStatus.Trial })).toBe(false)
  })

  test('reject an unknown limit kind', () => {
    expect(validate({ ...plan, limits: { seats: { kind: 'forever', limit: 1 } } })).toBe(false)
  })

  test('reject paygate alias maps and the misspelled suspension date', () => {
    expect(validate({ ...plan, suspendedAt: new Date() })).toBe(true)
    expect(validate({ ...plan, payagateAliases: { stripe: 'price_1' } })).toBe(false)
    expect(validate({ ...plan, supsendedAt: new Date() })).toBe(false)
  })
})

describe('wire shapes', () => {
  test('the entitlement view schema accepts a full view as the wire carries it', () => {
    const view = entitlementViewOf(plan, {
      sku: plan.sku, productSku: plan.productSku, title: plan.title, rank: 10, free: false,
      status: SubscriptionStatus.PastDue, paygate: 'stripe', subscriptionId: 'sub_1', pastDue: true,
      subscribedAt: new Date('2026-09-01T00:00:00.000Z'), periodEnd: new Date('2026-10-01T00:00:00.000Z'),
      fallbackSku: 'free-plan',
    }, [{ key: 'seats', window: 'occupancy', used: 1 }], new Date('2026-10-15T00:00:00.000Z'))
    const validate = ajv.compile(EntitlementViewSchema)

    expect(validate(JSON.parse(JSON.stringify(view)))).toBe(true)
    expect(validate({ ...JSON.parse(JSON.stringify(view)), entityId: 'internal' })).toBe(false)
  })

  test('a portal link body names a flow', () => {
    const validate = ajv.compile(PortalLinkBodySchema)
    expect(validate({ flow: PortalFlow.Change, planSku: 'pro-monthly', returnUrl: 'https://app.test/billing' })).toBe(true)
    expect(validate({ flow: 'refund' })).toBe(false)
    expect(validate({ flow: PortalFlow.Manage, entityId: 'internal' })).toBe(false)
  })

  test('a checkout body takes a plan sku and never an entity id', () => {
    const validate = ajv.compile(CreateCheckoutBodySchema)
    const body = { productSku: 'pro-product', planSku: 'pro-monthly', entitySlug: 'acme', service: 'app' }
    expect(validate(body)).toBe(true)
    expect(validate({ ...body, entitySlug: undefined, entityId: 'internal' })).toBe(false)
    expect(validate({ ...body, planSku: undefined, sku: 'pro-monthly' })).toBe(false)
  })

  test('an amount checkout body takes integer minor units only', () => {
    const validate = ajv.compile(CreateCheckoutBodySchema)
    const body = { productSku: 'credit-pack', entitySlug: 'acme', service: 'app' }
    expect(validate({ ...body, amountMinor: 500 })).toBe(true)
    expect(validate({ ...body, amountMinor: 500.5 })).toBe(false)
  })
})

describe('package surface', () => {
  test('declares no protocols: an application declares its own checkout and portal protocols', () => {
    for (const name of ['paymentApi', 'entrypoints', 'serviceEntrypoints']) {
      expect(payment).not.toHaveProperty(name)
    }
  })

  test('carries no subscription record, propagation body or legacy limit schemas', () => {
    for (const name of [
      'PlanSubscriptionSchema', 'SubscriptionPropagateBodySchema', 'SubscriptionPropogateBodySchema',
      'LimitConfigSchema', 'CapabilityUsageSchema',
    ]) {
      expect(payment).not.toHaveProperty(name)
    }
  })
})
