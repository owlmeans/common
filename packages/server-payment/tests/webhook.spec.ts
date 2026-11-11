import { describe, expect, test } from 'bun:test'
import { PaygateError, PaygateSignatureError, SubscriptionStatus, UnknownPaygate } from '@owlmeans/payment'
import { bind } from '@owlmeans/server-entrypoint'
import {
  CREDIT_UNIT, CREDITS_PRODUCT, FAKE_SIGNATURE, future, makeFakeContext, makeFakePaygate, past, PRO,
  type FakeContext, type FakePaygate,
} from '@owlmeans/test-payment'
import {
  paymentGate, paymentGateHandlers, type CheckoutSnapshot, type PaygateEvent, type PaygateSubscription,
} from '../src/index.js'

const ENTITY = 'entity-1'

const run = async (fake: FakeContext, params: Record<string, string>, headers: Record<string, string> = {}): Promise<Error | undefined> => {
  const entrypoint = bind(paymentGate.webhook, paymentGateHandlers.webhook)
  fake.ctx.registerEntrypoint(entrypoint as never)
  const res: { error?: Error, resolve: (value: unknown) => void, reject: (error: Error) => void } = {
    resolve: () => undefined, reject: error => { res.error = error },
  }
  await entrypoint.handle({ alias: entrypoint.alias, params, query: {}, body: {}, headers, path: '/', rawBody: '[]' } as never, res as never)

  return res.error
}

const subscription = (patch: Partial<PaygateSubscription> = {}): PaygateSubscription => ({
  id: 'sub_f', customerId: 'cus_f', metadata: { entityId: ENTITY }, status: SubscriptionStatus.Active, externalStatus: 'active',
  paused: false, planSku: PRO, itemId: 'item_f', priceId: 'price_f', periodStart: past(1), periodEnd: future(29),
  cancelAtPeriodEnd: false, latestInvoiceId: 'inv_f', currency: 'USD', createdAt: past(1), ...patch,
})

const topUp = (patch: Partial<CheckoutSnapshot> = {}): CheckoutSnapshot => ({
  id: 'cs_f', mode: 'payment', status: 'complete', payment: 'paid', promotionCodes: false, customerId: 'cus_f',
  currency: 'usd', amountSubtotalMinor: 1_021, amountTotalMinor: 1_021, amountTaxMinor: 0, paymentId: 'pay_f',
  buyer: { country: 'de', email: 'buyer@shop.eu' },
  metadata: {
    pricingMode: 'amount', amountMinor: '1000', chargeAmountMinor: '1021', sourceChargeAmountMinor: '1021',
    amountCurrency: 'usd', currency: 'usd', entityId: ENTITY, service: 'app', productSku: CREDITS_PRODUCT, planSku: CREDIT_UNIT,
  },
  ...patch,
})

const deliver = async (fake: FakeContext, paygate: FakePaygate, events: PaygateEvent[]): Promise<Error | undefined> => {
  paygate.state.pending.push(...events)
  return await run(fake, { paygate: paygate.provider.id }, { [FAKE_SIGNATURE]: 'ok' })
}

describe('@owlmeans/server-payment — the webhook route and the event dispatch', () => {
  test('refuses an unknown paygate first, then an unmanaged gateway, a paygate without webhook, a bad signature', async () => {
    const unmanaged = await makeFakeContext()
    expect(await run(unmanaged, { paygate: 'other' })).toBeInstanceOf(UnknownPaygate)
    expect(await run(unmanaged, { paygate: 'fake' })).toBeInstanceOf(PaygateError)

    const silent = makeFakePaygate({ without: ['webhook'] })
    const managed = await makeFakeContext({ providers: [silent.provider], gateway: { manage: true, bootstrap: false } })
    expect((await run(managed, { paygate: 'fake' }))?.message).toBe('payment:paygate:capability:webhook')

    const signed = await makeFakeContext({ gateway: { manage: true, bootstrap: false } })
    expect(await run(signed, { paygate: 'fake' }, { [FAKE_SIGNATURE]: 'forged' })).toBeInstanceOf(PaygateSignatureError)
    expect(signed.paygate?.state.calls.map(call => call.method)).toEqual(['webhook.verify'])
  })

  test('applies a verified delivery\'s events in order, every record and key under the paygate\'s id', async () => {
    const fake = await makeFakeContext({ gateway: { manage: true, bootstrap: false } })
    const paygate = fake.paygate as FakePaygate

    expect(await deliver(fake, paygate, [
      { type: 'customer', change: 'upserted', customer: { id: 'cus_f', email: 'buyer@shop.eu', country: 'de', currency: 'USD', metadata: { entityId: ENTITY } } },
      { type: 'subscription', eventId: 'evt_1', createdAt: new Date(), subscription: subscription(), deleted: false, trialEnding: false },
      { type: 'checkout', outcome: 'completed', session: topUp() },
    ])).toBeUndefined()

    expect(fake.stores['payment-paygate-customer'].rows).toEqual([expect.objectContaining({
      paygate: 'fake', externalId: 'cus_f', entityId: ENTITY, country: 'DE', currency: 'usd', email: 'buyer@shop.eu',
    })])
    expect(fake.stores['payment-subscription'].rows).toEqual([expect.objectContaining({
      paygate: 'fake', externalId: 'sub_f', planSku: PRO, status: SubscriptionStatus.Active, currency: 'usd', lastEventId: 'evt_1',
    })])
    expect(fake.observed.subscription.map(event => event.eventKey)).toEqual([expect.stringMatching(/^subscription:sub_f:created:/)])
    expect(fake.observed.topUp).toEqual([expect.objectContaining({ externalId: 'cs_f', paygate: 'fake', mode: 'amount', amountMinor: 1_000 })])
    expect(fake.stores['payment-fulfillment'].rows).toEqual([expect.objectContaining({
      paygate: 'fake', externalId: 'cs_f', paymentIntentId: 'pay_f', fulfilledAt: expect.any(Date),
    })])
    // An amount checkout reads its units from its metadata, never from the paygate.
    expect(paygate.state.calls.map(call => call.method)).toEqual(['webhook.verify'])

    expect(await deliver(fake, paygate, [
      { type: 'subscription', eventId: 'evt_2', createdAt: new Date(), subscription: subscription({ status: SubscriptionStatus.Canceled, externalStatus: 'canceled' }), deleted: true, trialEnding: false },
      { type: 'customer', change: 'deleted', customer: { id: 'cus_f', metadata: {} } },
    ])).toBeUndefined()
    expect(fake.observed.subscription.map(event => event.change)).toEqual(['created', 'canceled'])
    expect(fake.stores['payment-paygate-customer'].rows[0].deletedAt).toBeInstanceOf(Date)
  })

  test('a quantity checkout reads its units; refunds and disputes resolve to the fulfillment by its payment', async () => {
    const fake = await makeFakeContext({ gateway: { manage: true, bootstrap: false } })
    const paygate = fake.paygate as FakePaygate
    paygate.state.units = 7
    paygate.state.charges.ch_f = { id: 'ch_f', paymentId: 'pay_q', amountMinor: 3_500, refundedMinor: 500 }

    await deliver(fake, paygate, [{
      type: 'checkout', outcome: 'completed',
      session: topUp({ id: 'cs_q', paymentId: 'pay_q', metadata: { pricingMode: 'quantity', entityId: ENTITY, service: 'app', productSku: CREDITS_PRODUCT } }),
    }])
    expect(fake.observed.topUp).toEqual([expect.objectContaining({ externalId: 'cs_q', mode: 'quantity', units: 7 })])

    await deliver(fake, paygate, [
      { type: 'refund', refund: { id: 're_f', status: 'succeeded', succeeded: true, amountMinor: 500, currency: 'usd', paymentId: 'pay_q', chargeId: 'ch_f', metadata: {} } },
      { type: 'refund', refund: { id: 're_p', status: 'pending', succeeded: false, amountMinor: 100, currency: 'usd', paymentId: 'pay_q', metadata: {} } },
      { type: 'dispute', phase: 'opened', dispute: { id: 'dp_f', status: 'needs_response', amountMinor: 3_500, currency: 'usd', paymentId: 'pay_q', chargeId: 'ch_f' } },
    ])
    expect(fake.observed.refund).toEqual([expect.objectContaining({
      eventKey: 'refund:re_f', target: 'fulfillment', externalId: 'cs_q', refundedTotalMinor: 500, paidMinor: 3_500, partial: true,
    })])
    expect(fake.observed.dispute).toEqual([expect.objectContaining({ eventKey: 'dispute:dp_f:opened', paidMinor: 3_500 })])
    expect(paygate.state.calls.map(call => call.method)).toContain('checkout.units')
  })

  test('a failed and an expired checkout, a renewal invoice and a failed invoice', async () => {
    const fake = await makeFakeContext({ gateway: { manage: true, bootstrap: false } })
    const paygate = fake.paygate as FakePaygate
    paygate.state.subscriptions.sub_f = subscription()

    await deliver(fake, paygate, [
      { type: 'subscription', eventId: 'evt_s', createdAt: new Date(), subscription: subscription(), deleted: false, trialEnding: false },
      { type: 'invoice', eventId: 'evt_r', change: 'paid', invoice: { id: 'inv_2', subscriptionId: 'sub_f', customerId: 'cus_f', renewal: true } },
      { type: 'invoice', eventId: 'evt_x', change: 'payment-failed', invoice: { id: 'inv_3', subscriptionId: 'sub_f', customerId: 'cus_f', renewal: false, attempt: 2 } },
      { type: 'checkout', outcome: 'failed', session: topUp({ id: 'cs_x', payment: 'unpaid' }) },
      { type: 'checkout', outcome: 'expired', session: topUp({ id: 'cs_e', payment: 'unpaid' }) },
    ])

    expect(fake.observed.subscription.map(event => event.eventKey)).toEqual([
      expect.stringMatching(/^subscription:sub_f:created:/), 'subscription:sub_f:renewed:inv_2',
    ])
    expect(fake.observed.paymentFailed.map(event => event.eventKey)).toEqual(['payment-failed:inv_3:2', 'payment-failed:cs_x:0'])
    expect(fake.stores['payment-fulfillment'].rows).toEqual([expect.objectContaining({ externalId: 'cs_x', failedAt: expect.any(Date) })])
  })
})
