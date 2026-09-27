import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { LimitExhausted, SubscriptionStatus } from '@owlmeans/payment'
import { createEventHandler } from '../src/plugins/events.js'
import { ensureWebhookEndpoint } from '../src/plugins/webhook-manager.js'
import {
  entitlements, fulfillments, gateway, paymentWebhooks, subscriptions, usageCounters, usageEvents,
} from '../src/utils.js'
import { BURST_PLAN, gate, makeSuite } from './context.js'
import type { Booted } from './context.js'
import { CREDITS_PRODUCT, eventOf, makeFakeStripe, PRO, subscriptionOf, TEAM } from './fake-stripe.js'

const suite = makeSuite('payusage')
const it = gate.skip ? test.skip : test

describe('@owlmeans/server-payment — usage ledger on Mongo', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'mongo gate closed', () => {})
    return
  }

  let booted: Booted
  beforeAll(async () => { booted = await suite.boot() }, 60_000)
  afterAll(async () => { await suite.teardown() }, 60_000)

  it('admits exactly the limit out of 20 concurrent consumes', async () => {
    const { ctx } = booted
    await gateway(ctx).grantInternalPlan(ctx, 'burst-1', BURST_PLAN, { force: true })
    const results = await Promise.allSettled(Array.from({ length: 20 }, async (_, index) =>
      await entitlements(ctx).consume({ entityId: 'burst-1', limitKey: 'burst', eventKey: `burst:${index}` })))

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(5)
    const refused = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    expect(refused).toHaveLength(15)
    expect(refused.every(result => result.reason instanceof LimitExhausted)).toBe(true)
    expect(await usageEvents(ctx).count({ entityId: 'burst-1', limitKey: 'burst' })).toBe(5)
    expect((await usageCounters(ctx).load({ entityId: 'burst-1', limitKey: 'burst' }))?.used).toBe(5)
  }, 60_000)

  it('admits a concurrently repeated event key once', async () => {
    const { ctx } = booted
    await gateway(ctx).grantInternalPlan(ctx, 'dup-1', TEAM, { force: true })
    const outcomes = await Promise.all(Array.from({ length: 10 }, async () =>
      await entitlements(ctx).consume({ entityId: 'dup-1', limitKey: 'exports', eventKey: 'export:same', ref: 'same' })))

    expect(outcomes.every(outcome => outcome.admitted)).toBe(true)
    expect(outcomes.filter(outcome => !outcome.replayed)).toHaveLength(1)
    expect(await usageEvents(ctx).count({ entityId: 'dup-1', limitKey: 'exports' })).toBe(1)
    expect((await usageCounters(ctx).load({ entityId: 'dup-1', limitKey: 'exports' }))?.used).toBe(1)
    expect((await entitlements(ctx).consumptionByRef('dup-1', 'exports', 'same'))?.eventKey).toBe('export:same')
  }, 60_000)

  it('recomputes counters to the ledger sum and reconciles occupancy', async () => {
    const { ctx } = booted
    await gateway(ctx).grantInternalPlan(ctx, 'rec-1', PRO, { force: true })
    const service = entitlements(ctx)
    for (const key of ['a', 'b', 'c']) {
      await service.consume({ entityId: 'rec-1', limitKey: 'reports', eventKey: `report:${key}` })
    }
    await service.release({ entityId: 'rec-1', limitKey: 'reports', eventKey: 'report:b' })
    await usageCounters(ctx).collection.updateOne({ entityId: 'rec-1', limitKey: 'reports' }, { $set: { used: 7 } })

    const result = await service.reconcileCounters('rec-1')
    expect(result.repaired).toBeGreaterThanOrEqual(1)
    const { items } = await usageEvents(ctx).list({ entityId: 'rec-1', limitKey: 'reports' }, { size: 0 })
    const sum = items.reduce((total, event) => total + event.delta, 0)
    expect(sum).toBe(2)
    expect((await usageCounters(ctx).load({ entityId: 'rec-1', limitKey: 'reports' }))?.used).toBe(sum)

    const over = await service.reconcileOccupancy('rec-1', 'seats', 4)
    expect(over.overSince).toBeInstanceOf(Date)
    const within = await service.reconcileOccupancy('rec-1', 'seats', 2)
    expect(within).toEqual({ limitKey: 'seats', used: 2, limit: 2, over: 0 })
    expect((await usageCounters(ctx).load({ entityId: 'rec-1', limitKey: 'seats' }))?.overSince ?? null).toBeNull()
    expect(await usageEvents(ctx).count({ entityId: 'rec-1', limitKey: 'seats' })).toBe(1)
  }, 60_000)

  it('stores subscriptions, fulfillments and webhook endpoints through their collection validators', async () => {
    const { ctx } = booted
    const { stripe } = makeFakeStripe()
    const handler = createEventHandler(ctx, stripe)
    await handler.process(eventOf('customer.subscription.updated', subscriptionOf({ entityId: 'sub-1' })))
    await handler.process(eventOf('customer.subscription.updated', subscriptionOf({ entityId: 'sub-1', cancelAtPeriodEnd: true })))
    await handler.process(eventOf('checkout.session.completed', {
      id: 'cs_int', mode: 'payment', payment_status: 'paid', customer: 'cus_1', currency: 'usd', amount_subtotal: 1021,
      payment_intent: 'pi_int',
      metadata: {
        pricingMode: 'amount', amountMinor: '1000', chargeAmountMinor: '1021', currency: 'usd',
        entityId: 'sub-1', service: 'app', productSku: CREDITS_PRODUCT,
      },
    }))
    await ensureWebhookEndpoint(ctx, stripe)

    const row = await subscriptions(ctx).byExternalId('sub_1', 'stripe')
    expect(row).toEqual(expect.objectContaining({ status: SubscriptionStatus.Active, cancelAtPeriodEnd: true, rank: 10 }))
    expect(row?.propagated?.cancelAtPeriodEnd).toBe(true)
    expect(row?.createdAt).toBeInstanceOf(Date)
    expect((await entitlements(ctx).entitlements('sub-1')).plan.sku).toBe(PRO)
    expect((await fulfillments(ctx).byExternalId('cs_int', 'stripe'))?.fulfilledAt).toBeInstanceOf(Date)
    expect((await paymentWebhooks(ctx).load({ service: 'app' }))?.secret).toStartWith('whsec_')
  }, 60_000)
})
