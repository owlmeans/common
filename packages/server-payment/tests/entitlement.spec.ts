import { describe, expect, test } from 'bun:test'
import { INTERNAL_PAYGATE, PlanRequired, SubscriptionStatus } from '@owlmeans/payment'
import { entitlements, subscriptions } from '../src/utils.js'
import type { PaymentSubscriptionRecord } from '../src/types.js'
import {
  CAP_PREVIEW, CAP_WHITELABEL, FREE, future, makeFakeContext, past, PLANS_PRODUCT, PRO, TEAM,
} from './fake-stripe.js'
import type { FakeContext } from './fake-stripe.js'

const seed = async (
  fake: FakeContext, planSku: string, overrides: Partial<PaymentSubscriptionRecord> = {},
): Promise<PaymentSubscriptionRecord> => await subscriptions(fake.ctx).create({
  entityId: 'entity-1', planSku, productSku: PLANS_PRODUCT, service: 'app', paygate: 'stripe',
  externalId: `sub_${planSku}_${Math.random().toString(16).slice(2, 8)}`, status: SubscriptionStatus.Active,
  rank: planSku === TEAM ? 20 : planSku === PRO ? 10 : 0, createdAt: past(5), ...overrides,
})

describe('@owlmeans/server-payment — effective plan', () => {
  test('the highest-ranked entitling subscription wins, the newest on a tie', async () => {
    const fake = await makeFakeContext()
    await seed(fake, FREE, { paygate: INTERNAL_PAYGATE, externalId: 'free:entity-1' })
    await seed(fake, PRO, { status: SubscriptionStatus.PastDue })
    await seed(fake, TEAM, { status: SubscriptionStatus.Canceled })
    const older = await seed(fake, PRO, { createdAt: past(20) })

    const effective = await entitlements(fake.ctx).effectivePlan('entity-1')
    expect(effective.plan.sku).toBe(PRO)
    expect(effective.subscription?.status).toBe(SubscriptionStatus.PastDue)
    expect(effective.subscription?.externalId).not.toBe(older.externalId)
    expect(effective.fallback?.sku).toBe(FREE)
  })

  test('falls back to the free plan past suspended rows, expired internal grants and unknown plans', async () => {
    const fake = await makeFakeContext()
    await seed(fake, TEAM, { status: SubscriptionStatus.Suspended })
    await seed(fake, TEAM, { paygate: INTERNAL_PAYGATE, periodEnd: past(1) })
    await seed(fake, 'retired-plan', { rank: 99 })

    const effective = await entitlements(fake.ctx).effectivePlan('entity-1')
    expect(effective.plan.sku).toBe(FREE)
    expect(effective.subscription).toBeNull()

    await seed(fake, PRO, { paygate: INTERNAL_PAYGATE, periodEnd: future(1) })
    expect((await entitlements(fake.ctx).effectivePlan('entity-1')).plan.sku).toBe(PRO)
  })

  test('without a free plan and without a subscription it is a PlanRequired fault', async () => {
    const fake = await makeFakeContext({ catalogue: { free: false } })
    await expect(entitlements(fake.ctx).effectivePlan('entity-1')).rejects.toBeInstanceOf(PlanRequired)
  })
})

describe('@owlmeans/server-payment — the entitlement view', () => {
  test('describes the plan behind it: subscribed-at, past-due and the fallback', async () => {
    const fake = await makeFakeContext()
    const row = await seed(fake, PRO, {
      status: SubscriptionStatus.PastDue, periodEnd: future(10), cancelAtPeriodEnd: true,
    })

    const view = await entitlements(fake.ctx).entitlements('entity-1')
    expect(view.plan).toEqual(expect.objectContaining({
      sku: PRO, rank: 10, free: false, status: SubscriptionStatus.PastDue, paygate: 'stripe',
      subscriptionId: row.externalId, pastDue: true, fallbackSku: FREE, cancelAtPeriodEnd: true,
    }))
    expect(view.plan.subscribedAt?.getTime()).toBe(row.createdAt.getTime())

    const free = await entitlements(fake.ctx).entitlements('entity-2')
    expect(free.plan).toEqual(expect.objectContaining({ sku: FREE, free: true, paygate: INTERNAL_PAYGATE }))
    expect(free.plan.fallbackSku).toBeUndefined()
  })

  test('reads usage from the current window counter only', async () => {
    const fake = await makeFakeContext()
    await seed(fake, PRO)
    await entitlements(fake.ctx).consume({ entityId: 'entity-1', limitKey: 'exports', eventKey: 'export:1' })
    fake.stores['payment-usage-counter'].rows.push({
      entityId: 'entity-1', limitKey: 'exports', window: '2001-01-01', used: 3, limit: 3, updatedAt: past(9000),
    })

    const exports = (await entitlements(fake.ctx).entitlements('entity-1')).limits.find(limit => limit.key === 'exports')
    expect(exports).toEqual(expect.objectContaining({ used: 1, limit: 3, remaining: 2 }))
  })

  test('grandfathers a promo for a subscription created before it ended, and lapses it otherwise', async () => {
    const fake = await makeFakeContext({ catalogue: { reportsUntil: past(2), previewUntil: past(2) } })
    await seed(fake, PRO, { entityId: 'early', createdAt: past(10) })
    await seed(fake, PRO, { entityId: 'late', createdAt: past(1) })

    const early = await entitlements(fake.ctx).entitlements('early')
    const late = await entitlements(fake.ctx).entitlements('late')
    expect(early.limits.find(limit => limit.key === 'reports')).toEqual(expect.objectContaining({
      limit: 4, promo: expect.objectContaining({ active: true, grandfathered: true }),
    }))
    expect(late.limits.find(limit => limit.key === 'reports')).toEqual(expect.objectContaining({
      limit: 0, promo: expect.objectContaining({ active: false, grandfathered: false }),
    }))

    // The free plan's preview promo does not grandfather: lapsed for everyone.
    expect(await entitlements(fake.ctx).hasCapability('nobody', CAP_PREVIEW)).toBe(false)
    expect(await entitlements(fake.ctx).hasCapability('early', CAP_WHITELABEL)).toBe(true)
    expect(await entitlements(fake.ctx).hasCapability('nobody', CAP_WHITELABEL)).toBe(false)
  })
})
