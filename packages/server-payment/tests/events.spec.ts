import { describe, expect, test } from 'bun:test'
import { ProductError, SubscriptionStatus } from '@owlmeans/payment'
import { createEventHandler, mapStatus } from '../src/plugins/events.js'
import { resyncStripeSubscription, resyncStripeSubscriptions } from '../src/plugins/events.js'
import { classifySubscriptionChange } from '../src/subscription.js'
import { gateway } from '../src/utils.js'
import type { PaymentSubscriptionRecord, PropagatedState } from '../src/types.js'
import {
  CAP_WHITELABEL, CREDITS_PRODUCT, eventOf, FREE, future, makeFakeContext, PRO, subscriptionOf, TEAM,
} from './fake-stripe.js'
import type { FakeContext, SubscriptionShape } from './fake-stripe.js'

const send = async (fake: FakeContext, type: string, object: unknown, overrides: Record<string, unknown> = {}) => {
  const event = eventOf(type, object, overrides)
  await createEventHandler(fake.ctx, fake.stripe).process(event)
  return event
}
const rows = (fake: FakeContext) => fake.stores['payment-subscription'].rows
const changes = (fake: FakeContext) => fake.observed.subscription.map(event => event.change)
const epoch = (date: Date): number => Math.floor(date.getTime() / 1000)

const subscribe = async (fake: FakeContext, shape: SubscriptionShape = {}) => {
  const subscription = subscriptionOf(shape)
  fake.state.subscriptions[subscription.id] = subscription as never
  await send(fake, 'customer.subscription.updated', subscription)
  return subscription
}

const record = (status: SubscriptionStatus, overrides: Partial<PaymentSubscriptionRecord> = {}): PaymentSubscriptionRecord => ({
  entityId: 'e', planSku: PRO, productSku: 'p', service: 's', paygate: 'stripe', externalId: 'sub_1', status,
  rank: 10, createdAt: new Date(), ...overrides,
})
const state = (overrides: Partial<PropagatedState> = {}): PropagatedState => ({
  planSku: PRO, rank: 10, status: SubscriptionStatus.Active, cancelAtPeriodEnd: false, ...overrides,
})

describe('@owlmeans/server-payment — subscription change classification', () => {
  test('created once entitling; canceled; paused; resumed from a pause or a suspension', () => {
    expect(classifySubscriptionChange(null, record(SubscriptionStatus.Active))).toBe('created')
    expect(classifySubscriptionChange(null, record(SubscriptionStatus.Trial))).toBe('created')
    expect(classifySubscriptionChange(null, record(SubscriptionStatus.Created))).toBeNull()
    expect(classifySubscriptionChange(state(), record(SubscriptionStatus.Canceled))).toBe('canceled')
    expect(classifySubscriptionChange(state(), record(SubscriptionStatus.Ended))).toBe('canceled')
    expect(classifySubscriptionChange(state(), record(SubscriptionStatus.Suspended, { pausedAt: new Date() }))).toBe('paused')
    expect(classifySubscriptionChange(state({ status: SubscriptionStatus.Suspended, pausedAt: new Date() }), record(SubscriptionStatus.Active))).toBe('resumed')
    expect(classifySubscriptionChange(state({ status: SubscriptionStatus.Suspended }), record(SubscriptionStatus.Active))).toBe('resumed')
  })

  test('plan changes by rank, cancel scheduling, renewal once per invoice, dunning, trial end, else nothing', () => {
    expect(classifySubscriptionChange(state(), record(SubscriptionStatus.Active, { planSku: TEAM, rank: 20 }))).toBe('upgraded')
    expect(classifySubscriptionChange(state({ planSku: TEAM, rank: 20 }), record(SubscriptionStatus.Active))).toBe('downgraded')
    expect(classifySubscriptionChange(state(), record(SubscriptionStatus.Active, { planSku: 'pro-yearly', rank: 10 }))).toBe('upgraded')
    expect(classifySubscriptionChange(state(), record(SubscriptionStatus.Active, { cancelAtPeriodEnd: true }))).toBe('cancel-scheduled')
    expect(classifySubscriptionChange(state({ cancelAtPeriodEnd: true }), record(SubscriptionStatus.Active))).toBe('cancel-undone')
    expect(classifySubscriptionChange(state(), record(SubscriptionStatus.Active), { renewal: true, invoiceId: 'in_2' })).toBe('renewed')
    expect(classifySubscriptionChange(state({ renewedInvoiceId: 'in_2' }), record(SubscriptionStatus.Active), { renewal: true, invoiceId: 'in_2' })).toBeNull()
    expect(classifySubscriptionChange(state(), record(SubscriptionStatus.PastDue))).toBe('past-due')
    expect(classifySubscriptionChange(state(), record(SubscriptionStatus.Suspended))).toBe('suspended')
    expect(classifySubscriptionChange(state(), record(SubscriptionStatus.Trial), { trialEnding: true })).toBe('trial-ending')
    expect(classifySubscriptionChange(state(), record(SubscriptionStatus.Active))).toBeNull()
  })

  test('maps paygate statuses: past_due entitles, unpaid, paused and paused collection revoke', () => {
    const map = (status: string, pause: unknown = null) => mapStatus({ status, pause_collection: pause } as never)
    expect(map('active')).toBe(SubscriptionStatus.Active)
    expect(map('trialing')).toBe(SubscriptionStatus.Trial)
    expect(map('past_due')).toBe(SubscriptionStatus.PastDue)
    expect(map('unpaid')).toBe(SubscriptionStatus.Suspended)
    expect(map('paused')).toBe(SubscriptionStatus.Suspended)
    expect(map('active', { behavior: 'void' })).toBe(SubscriptionStatus.Suspended)
    expect(map('incomplete')).toBe(SubscriptionStatus.Created)
    expect(map('incomplete_expired')).toBe(SubscriptionStatus.Ended)
    expect(map('canceled')).toBe(SubscriptionStatus.Canceled)
  })
})

describe('@owlmeans/server-payment — customer and checkout events', () => {
  test('customer created and updated upsert the customer; deleted marks it', async () => {
    const fake = await makeFakeContext()
    await send(fake, 'customer.created', { id: 'cus_1', email: 'a@example.com', metadata: { entityId: 'entity-1' } })
    await send(fake, 'customer.updated', { id: 'cus_1', email: 'b@example.com', metadata: {} })
    expect(fake.stores['payment-paygate-customer'].rows).toEqual([
      expect.objectContaining({ externalId: 'cus_1', entityId: 'entity-1', email: 'b@example.com' }),
    ])
    await send(fake, 'customer.deleted', { id: 'cus_1', deleted: true })
    expect(fake.stores['payment-paygate-customer'].rows[0].deletedAt).toBeInstanceOf(Date)
  })

  test('an asynchronous payment failure is recorded and observed; an expired session leaves nothing', async () => {
    const fake = await makeFakeContext()
    const session = {
      id: 'cs_1', mode: 'payment', customer: 'cus_1', payment_intent: 'pi_1',
      metadata: { entityId: 'entity-1', service: 'app', productSku: CREDITS_PRODUCT, pricingMode: 'amount' },
    }
    await send(fake, 'checkout.session.async_payment_failed', session)
    expect(fake.stores['payment-fulfillment'].rows[0]).toEqual(expect.objectContaining({ externalId: 'cs_1', paymentIntentId: 'pi_1' }))
    expect(fake.stores['payment-fulfillment'].rows[0].failedAt).toBeInstanceOf(Date)
    expect(fake.observed.paymentFailed).toEqual([
      expect.objectContaining({ entityId: 'entity-1', kind: 'checkout', externalId: 'cs_1', eventKey: 'payment-failed:cs_1:0' }),
    ])

    await send(fake, 'checkout.session.expired', session)
    expect(fake.stores['payment-fulfillment'].rows).toHaveLength(0)
  })
})

describe('@owlmeans/server-payment — subscription events', () => {
  test('observers hear `created` once the subscription entitles; a repeated or payment-method-only event says nothing', async () => {
    const fake = await makeFakeContext()
    await send(fake, 'customer.subscription.created', subscriptionOf({ status: 'incomplete' }))
    expect(rows(fake)[0].status).toBe(SubscriptionStatus.Created)
    expect(fake.observed.subscription).toHaveLength(0)

    const active = subscriptionOf()
    const event = await send(fake, 'customer.subscription.updated', active)
    const [created] = fake.observed.subscription
    expect(created).toEqual(expect.objectContaining({
      change: 'created', active: true, previous: null, externalEventId: event.id,
      eventKey: `subscription:sub_1:created:${new Date(active.created * 1000).toISOString()}`,
    }))
    expect(created.current).toEqual(expect.objectContaining({ planSku: PRO, rank: 10, entityId: 'entity-1', subscriptionId: 'sub_1' }))
    expect(created.current.capabilities?.[0].permissions.whitelabel).toBe(true)
    expect(rows(fake)[0].initialPropagatedAt).toBeInstanceOf(Date)

    await createEventHandler(fake.ctx, fake.stripe).process(event)
    await send(fake, 'customer.subscription.updated', subscriptionOf({ defaultPaymentMethod: 'pm_2' }))
    expect(changes(fake)).toEqual(['created'])
  })

  test('plan changes and cancel scheduling are classified with stable keys', async () => {
    const fake = await makeFakeContext()
    await subscribe(fake)
    await send(fake, 'customer.subscription.updated', subscriptionOf({ planSku: TEAM }))
    await send(fake, 'customer.subscription.pending_update_applied', subscriptionOf({ planSku: PRO }))
    await send(fake, 'customer.subscription.updated', subscriptionOf({ cancelAtPeriodEnd: true }))
    const undo = await send(fake, 'customer.subscription.updated', subscriptionOf({ cancelAtPeriodEnd: false }))

    expect(changes(fake)).toEqual(['created', 'upgraded', 'downgraded', 'cancel-scheduled', 'cancel-undone'])
    expect(fake.observed.subscription[1].eventKey).toBe(`subscription:sub_1:upgraded:${TEAM}`)
    expect(fake.observed.subscription[1].previous?.rank).toBe(10)
    expect(fake.observed.subscription[1].current.rank).toBe(20)
    expect(fake.observed.subscription[2].eventKey).toBe(`subscription:sub_1:downgraded:${PRO}`)
    expect(fake.observed.subscription[4].eventKey).toBe(`subscription:sub_1:cancel-undone:${undo.id}`)
  })

  test('paused collection suspends, resume restores, trial end is announced, deletion cancels', async () => {
    const fake = await makeFakeContext()
    await subscribe(fake)
    await send(fake, 'customer.subscription.updated', subscriptionOf({ pauseCollection: { behavior: 'void' } }))
    expect(rows(fake)[0]).toEqual(expect.objectContaining({ status: SubscriptionStatus.Suspended, externalStatus: 'active' }))
    expect(rows(fake)[0].pausedAt).toBeInstanceOf(Date)
    await send(fake, 'customer.subscription.resumed', subscriptionOf())
    expect(rows(fake)[0].pausedAt).toBeUndefined()

    const trialEnd = future(3)
    await send(fake, 'customer.subscription.trial_will_end', subscriptionOf({ status: 'trialing', trialEnd }))
    await send(fake, 'customer.subscription.deleted', subscriptionOf({ status: 'canceled' }))

    expect(changes(fake)).toEqual(['created', 'paused', 'resumed', 'trial-ending', 'canceled'])
    expect(fake.observed.subscription[3].eventKey)
      .toBe(`subscription:sub_1:trial-ending:${new Date(epoch(trialEnd) * 1000).toISOString()}`)
    expect(rows(fake)[0].status).toBe(SubscriptionStatus.Canceled)
    expect(rows(fake)[0].endedAt).toBeInstanceOf(Date)
  })

  test('a throwing observer leaves the change to be told again; an older payload is not applied', async () => {
    const fake = await makeFakeContext()
    await subscribe(fake)
    fake.observed.failSubscription = 1
    const upgrade = eventOf('customer.subscription.updated', subscriptionOf({ planSku: TEAM }))
    await expect(createEventHandler(fake.ctx, fake.stripe).process(upgrade)).rejects.toThrow('observer unavailable')
    expect(rows(fake)[0].planSku).toBe(TEAM)
    await createEventHandler(fake.ctx, fake.stripe).process(upgrade)
    expect(changes(fake)).toEqual(['created', 'upgraded'])

    await send(fake, 'customer.subscription.updated', subscriptionOf({ planSku: PRO }), { created: epoch(new Date()) - 3600 })
    expect(rows(fake)[0].planSku).toBe(TEAM)
  })
})

describe('@owlmeans/server-payment — invoice events', () => {
  const invoice = (overrides: Record<string, unknown> = {}) => ({
    id: 'in_2', object: 'invoice', subscription: 'sub_1', customer: 'cus_1', billing_reason: 'subscription_cycle',
    attempt_count: 1, next_payment_attempt: epoch(future(2)), ...overrides,
  })

  test('a paid cycle invoice renews once per invoice; any other paid invoice only moves the latest invoice', async () => {
    const fake = await makeFakeContext()
    await subscribe(fake)
    await send(fake, 'invoice.paid', invoice())
    await send(fake, 'invoice.paid', invoice())
    expect(changes(fake)).toEqual(['created', 'renewed'])
    expect(fake.observed.subscription[1]).toEqual(expect.objectContaining({
      eventKey: 'subscription:sub_1:renewed:in_2', invoiceId: 'in_2',
    }))

    await send(fake, 'invoice.paid', invoice({ id: 'in_3', billing_reason: 'manual' }))
    expect(rows(fake)[0].latestInvoiceId).toBe('in_3')
    expect(changes(fake)).toEqual(['created', 'renewed'])
  })

  test('a failed payment re-reads the subscription (past-due) and reports the attempt', async () => {
    const fake = await makeFakeContext()
    await subscribe(fake)
    fake.state.subscriptions.sub_1 = subscriptionOf({ status: 'past_due' }) as never
    await send(fake, 'invoice.payment_failed', invoice({ attempt_count: 2 }))
    await send(fake, 'invoice.payment_action_required', invoice({ attempt_count: 2, next_payment_attempt: null }))

    expect(changes(fake)).toEqual(['created', 'past-due'])
    expect(fake.observed.paymentFailed).toEqual([
      expect.objectContaining({
        entityId: 'entity-1', kind: 'invoice', invoiceId: 'in_2', subscriptionId: 'sub_1', attempt: 2,
        actionRequired: false, eventKey: 'payment-failed:in_2:2',
      }),
      expect.objectContaining({ actionRequired: true, eventKey: 'payment-failed:in_2:2' }),
    ])
    expect(fake.observed.paymentFailed[0].nextAttemptAt).toBeInstanceOf(Date)
  })

  test('uncollectible suspends, voided refreshes the latest invoice, upcoming does nothing', async () => {
    const fake = await makeFakeContext()
    await subscribe(fake, { latestInvoice: 'in_1' })
    fake.state.calls.length = 0
    await send(fake, 'invoice.upcoming', { object: 'invoice', subscription: 'sub_1' })
    expect(fake.state.calls).toEqual([])

    fake.state.subscriptions.sub_1 = subscriptionOf({ status: 'unpaid', latestInvoice: 'in_4' }) as never
    await send(fake, 'invoice.marked_uncollectible', invoice())
    expect(changes(fake)).toEqual(['created', 'suspended'])

    fake.state.subscriptions.sub_1 = subscriptionOf({ status: 'unpaid', latestInvoice: 'in_5' }) as never
    await send(fake, 'invoice.voided', invoice({ id: 'in_4' }))
    expect(rows(fake)[0].latestInvoiceId).toBe('in_5')
    expect(changes(fake)).toEqual(['created', 'suspended'])
  })
})

describe('@owlmeans/server-payment — refund and dispute events', () => {
  const fulfilled = async () => {
    const fake = await makeFakeContext({
      stripe: {
        charges: { ch_1: { id: 'ch_1', amount: 1225, amount_refunded: 500, payment_intent: 'pi_1', invoice: null } },
      },
    })
    await send(fake, 'checkout.session.completed', {
      id: 'cs_1', mode: 'payment', payment_status: 'paid', customer: 'cus_1', currency: 'usd', amount_subtotal: 1021,
      payment_intent: 'pi_1', invoice: 'in_9',
      metadata: {
        pricingMode: 'amount', amountMinor: '1000', chargeAmountMinor: '1021', currency: 'usd',
        entityId: 'entity-1', service: 'app', productSku: CREDITS_PRODUCT, planSku: 'app-credit-unit',
      },
    })
    return fake
  }
  const refund = (overrides: Record<string, unknown> = {}) => ({
    id: 're_1', object: 'refund', amount: 500, currency: 'usd', status: 'succeeded', payment_intent: 'pi_1', charge: 'ch_1',
    ...overrides,
  })

  test('a succeeded refund of a fulfillment is recorded and observed with the checkout amounts', async () => {
    const fake = await fulfilled()
    await send(fake, 'refund.updated', refund({ status: 'pending' }))
    await send(fake, 'refund.failed', refund({ status: 'failed' }))
    expect(fake.observed.refund).toHaveLength(0)

    await send(fake, 'refund.created', refund())
    expect(fake.stores['payment-fulfillment'].rows[0]).toEqual(expect.objectContaining({ refundedMinor: 500, paymentIntentId: 'pi_1' }))
    expect(fake.observed.refund).toEqual([expect.objectContaining({
      entityId: 'entity-1', target: 'fulfillment', externalId: 'cs_1', refundId: 're_1', amountMinor: 500,
      refundedTotalMinor: 500, paidMinor: 1225, partial: true, currency: 'usd', eventKey: 'refund:re_1',
      netAmountMinor: 1000, chargeAmountMinor: 1021, productSku: CREDITS_PRODUCT,
    })])
  })

  test('charge.refunded resolves a subscription invoice through the charge; an unknown payment is ignored', async () => {
    const fake = await makeFakeContext({
      stripe: {
        charges: { ch_2: { id: 'ch_2', amount: 2000, amount_refunded: 2000, payment_intent: 'pi_2', invoice: 'in_2' } },
        refunds: [{ id: 're_2', amount: 2000, currency: 'usd', status: 'succeeded', charge: 'ch_2', payment_intent: 'pi_2' }],
      },
    })
    await subscribe(fake, { latestInvoice: 'in_2' })
    await send(fake, 'charge.refunded', fake.state.charges.ch_2)
    expect(fake.observed.refund).toEqual([expect.objectContaining({
      target: 'subscription', externalId: 'sub_1', invoiceId: 'in_2', planSku: PRO, partial: false, eventKey: 'refund:re_2',
    })])

    await send(fake, 'refund.created', refund({ id: 're_x', payment_intent: 'pi_x', charge: null }))
    expect(fake.observed.refund).toHaveLength(1)
  })

  test('every dispute phase marks the target and is observed once per phase', async () => {
    const fake = await fulfilled()
    const dispute = { id: 'dp_1', object: 'dispute', amount: 1225, currency: 'usd', charge: 'ch_1', payment_intent: null }
    await send(fake, 'charge.dispute.created', { ...dispute, status: 'needs_response' })
    await send(fake, 'charge.dispute.funds_withdrawn', { ...dispute, status: 'under_review' })
    await send(fake, 'charge.dispute.funds_reinstated', { ...dispute, status: 'won' })
    await send(fake, 'charge.dispute.closed', { ...dispute, status: 'won' })

    expect(fake.observed.dispute.map(event => event.eventKey)).toEqual([
      'dispute:dp_1:opened', 'dispute:dp_1:funds-withdrawn', 'dispute:dp_1:funds-reinstated', 'dispute:dp_1:closed',
    ])
    expect(fake.observed.dispute[0]).toEqual(expect.objectContaining({
      target: 'fulfillment', externalId: 'cs_1', amountMinor: 1225, netAmountMinor: 1000,
    }))
    expect(fake.stores['payment-fulfillment'].rows[0]).toEqual(expect.objectContaining({ disputeStatus: 'won', chargeId: 'ch_1' }))
    expect(fake.stores['payment-fulfillment'].rows[0].disputedAt).toBeInstanceOf(Date)
  })
})

describe('@owlmeans/server-payment — resync and internal grants', () => {
  test('resync applies the paygate state, cancels a vanished subscription and skips terminal rows', async () => {
    const fake = await makeFakeContext()
    await subscribe(fake)
    await subscribe(fake, { id: 'sub_2', planSku: TEAM, entityId: 'entity-2' })
    fake.state.subscriptions.sub_1 = subscriptionOf({ cancelAtPeriodEnd: true }) as never
    delete fake.state.subscriptions.sub_2

    expect(await resyncStripeSubscriptions(fake.ctx, fake.stripe)).toEqual({ scanned: 2, updated: 2 })
    expect(changes(fake)).toEqual(['created', 'created', 'cancel-scheduled', 'canceled'])
    expect(rows(fake).find(row => row.externalId === 'sub_2')?.status).toBe(SubscriptionStatus.Canceled)

    expect(await resyncStripeSubscriptions(fake.ctx, fake.stripe)).toEqual({ scanned: 1, updated: 0 })
    expect(await resyncStripeSubscription(fake.ctx, fake.stripe, { entityId: 'entity-2' })).toBe(0)
  })

  test('an internal grant is created once, keeps its creation date and needs force for a paid plan', async () => {
    const fake = await makeFakeContext()
    const first = await gateway(fake.ctx).grantInternalPlan(fake.ctx, 'entity-1', FREE)
    const again = await gateway(fake.ctx).grantInternalPlan(fake.ctx, 'entity-1', FREE)
    expect(first.externalId).toBe('free:entity-1')
    expect(again.createdAt.getTime()).toBe(first.createdAt.getTime())
    expect(fake.observed.subscription).toEqual([expect.objectContaining({
      change: 'created', eventKey: `subscription:free:entity-1:created:${first.createdAt.toISOString()}`,
    })])

    await expect(gateway(fake.ctx).grantInternalPlan(fake.ctx, 'entity-1', PRO)).rejects.toBeInstanceOf(ProductError)
    const comp = await gateway(fake.ctx).grantInternalPlan(fake.ctx, 'entity-1', PRO, { force: true, periodEnd: future(365) })
    expect(comp).toEqual(expect.objectContaining({ externalId: `internal:${PRO}:entity-1`, paygate: 'internal', rank: 10 }))
    expect(fake.observed.subscription[1].current.capabilities?.some(set => set.permissions.whitelabel === true)).toBe(true)
    expect(CAP_WHITELABEL).toBe('feature:whitelabel')
  })
})
