import { describe, expect, test } from 'bun:test'
import {
  ConsumerRightsError, PortalFlow, PortalUnavailable, ProductError, PurchaseKind, SubscriptionStatus,
  TaxEstimateStatus, WithdrawalStatus,
} from '@owlmeans/payment'
import {
  CREDITS_PRODUCT, future, makeFakeContext, makeFakePaygate, past, PLANS_PRODUCT, PRO,
  type FakeContextOptions, type FakePaygate, type FakePaygateOptions,
} from '@owlmeans/test-payment'
import {
  estimateOf, makeEstimateCache, paymentAccessOf, productSyncOf, type CheckoutAttempt, type CheckoutPlugin,
  type ConsumerRightsDef, type UsageMeter,
} from '../src/index.js'

const ENTITY = 'entity-1'
const successUrl = 'https://app.example.com/ok'
const MANAGED = { manage: true, bootstrap: false }

const managed = async (paygate: FakePaygateOptions = {}, opts: FakeContextOptions = {}) => {
  const fake = makeFakePaygate(paygate)
  const context = await makeFakeContext({ providers: [fake.provider], gateway: MANAGED, ...opts })
  return { ...context, fake }
}
const methods = (fake: FakePaygate) => fake.state.calls.map(call => call.method)

const RIGHTS: ConsumerRightsDef = {
  textVersion: 'terms-v1',
  links: { en: { billingTerms: 'https://legal.example.com/billing', withdrawalInformation: 'https://legal.example.com/withdrawal' } },
  mechanisms: { withdrawal: true, automaticRefunds: true },
  trader: { name: 'Example', legalName: 'Example Ltd', address: '1 Example Street', email: 'support@example.com' },
}
const meter: UsageMeter = { used: async () => ({ granted: 1_000, used: 0, usedAfter: 0 }) }

/** A paid, in-scope purchase of the fake paygate with an open window. */
const purchaseRow = (patch: Record<string, unknown> = {}) => ({
  purchaseId: 'fake:cs_1', contractRef: 'CR-261102-ABCDEF', entityId: ENTITY, kind: PurchaseKind.TopUp, paygate: 'fake',
  sessionId: 'cs_1', paymentIntentId: 'pay_1', productSku: CREDITS_PRODUCT, inScope: true, language: 'en', currency: 'usd',
  amountSubtotalMinor: 1_000, amountTaxMinor: 0, amountTotalMinor: 1_000, purchasedAt: past(1), deadline: future(13),
  createdAt: past(1), ...patch,
})

describe('@owlmeans/server-payment — the checkout a paygate is asked for', () => {
  test('an amount checkout: the inline line, the policy\'s options and the metadata the events read back', async () => {
    const { ctx, fake } = await managed()
    const url = await paymentAccessOf(ctx).gateway().createLink(ctx, {
      productSku: CREDITS_PRODUCT, entityId: ENTITY, profileId: 'profile-1', service: 'app', amountMinor: 1_000,
      locale: 'de', submitText: 'Top up', successUrl,
    })

    expect(url).toStartWith('https://pay.example.test/')
    expect(fake.state.sessions).toEqual([{
      mode: 'amount', entityId: ENTITY, productSku: CREDITS_PRODUCT, planSku: 'app-credit-unit', customerId: 'cus_1',
      line: { kind: 'amount', productSku: CREDITS_PRODUCT, currency: 'usd', unitAmountMinor: 1_021 },
      currency: 'usd', forceCurrency: false, successUrl, cancelUrl: successUrl, locale: 'de',
      automaticTax: true, collectTaxId: true, keepAddress: false, adaptiveCurrency: false, collectTerms: false,
      texts: { submit: 'Top up' },
      metadata: {
        pricingMode: 'amount', currency: 'usd', entityId: ENTITY, profileId: 'profile-1', service: 'app',
        productSku: CREDITS_PRODUCT, planSku: 'app-credit-unit', amountCurrency: 'usd', amountMinor: '1000',
        sourceChargeAmountMinor: '1021', chargeAmountMinor: '1021',
      },
    }])
    expect(methods(fake)).toEqual(['customers.ensure', 'checkout.createSession'])
  })

  test('a plugin\'s lifetime is clamped into the paygate\'s bounds; a paygate without bounds takes none', async () => {
    const attempts: CheckoutAttempt[] = []
    const plugin: CheckoutPlugin = { alias: 'hold', sessionTtlSeconds: 60, admit: async (_ctx, attempt) => { attempts.push(attempt) } }
    const bounded = await managed()
    paymentAccessOf(bounded.ctx).gateway().use(plugin)
    await paymentAccessOf(bounded.ctx).gateway().createLink(bounded.ctx, { productSku: CREDITS_PRODUCT, entityId: ENTITY, service: 'app', amountMinor: 1_000 })
    expect(attempts[0].sessionTtlSeconds).toBe(30 * 60)
    expect(bounded.fake.state.sessions[0].expiresAt).toBeInstanceOf(Date)

    const open = await managed({ features: { sessionTtl: undefined } })
    paymentAccessOf(open.ctx).gateway().use(plugin)
    await paymentAccessOf(open.ctx).gateway().createLink(open.ctx, { productSku: CREDITS_PRODUCT, entityId: ENTITY, service: 'app', amountMinor: 1_000 })
    expect(attempts[1].sessionTtlSeconds).toBeUndefined()
    expect(open.fake.state.sessions[0].expiresAt).toBeUndefined()
  })

  test('a text longer than the paygate shows is refused before any session', async () => {
    const { ctx, fake } = await managed({ features: { customTextMax: 5 } })
    await expect(paymentAccessOf(ctx).gateway().createLink(ctx, {
      productSku: CREDITS_PRODUCT, entityId: ENTITY, service: 'app', amountMinor: 1_000, submitText: 'far too long',
    })).rejects.toBeInstanceOf(ConsumerRightsError)
    expect(methods(fake)).not.toContain('checkout.createSession')
  })

  test('a created session a plugin refuses is expired and every hold released; a session without a URL is refused', async () => {
    const settled: string[] = []
    const { ctx, fake } = await managed()
    paymentAccessOf(ctx).gateway().use({ alias: 'hold', admit: async () => ({ reservationId: 'r1' }), settled: async (_ctx, done) => { settled.push(done.outcome) } })
    paymentAccessOf(ctx).gateway().use({ alias: 'veto', created: async () => { throw new Error('veto') } })
    await expect(paymentAccessOf(ctx).gateway().createLink(ctx, { productSku: CREDITS_PRODUCT, entityId: ENTITY, service: 'app', amountMinor: 1_000 }))
      .rejects.toThrow('veto')
    expect(fake.state.expired).toEqual(['cs_2'])
    expect(settled).toEqual(['failed'])

    fake.state.sessionUrl = null
    paymentAccessOf(ctx).gateway().use({ alias: 'veto' })
    await expect(paymentAccessOf(ctx).gateway().createLink(ctx, { productSku: CREDITS_PRODUCT, entityId: ENTITY, service: 'app', amountMinor: 1_000 }))
      .rejects.toThrow('paygate:session')
  })

  test('the customer e-mail lock requires a usable e-mail before any paygate call, and pins it', async () => {
    const { ctx, fake } = await managed({ state: { locks: { email: true, country: false } } })
    await expect(paymentAccessOf(ctx).gateway().createLink(ctx, { productSku: CREDITS_PRODUCT, entityId: ENTITY, service: 'app', amountMinor: 1_000 }))
      .rejects.toThrow('paygate:customer-email')
    expect(fake.state.calls).toEqual([])

    await paymentAccessOf(ctx).gateway().createLink(ctx, {
      productSku: CREDITS_PRODUCT, entityId: ENTITY, service: 'app', amountMinor: 1_000, email: ' owner@shop.eu ',
    })
    expect(fake.state.calls[0]).toEqual({ method: 'customers.ensure', args: [{ entityId: ENTITY, service: 'app', email: 'owner@shop.eu' }] })
  })
})

describe('@owlmeans/server-payment — a capability the paygate lacks', () => {
  test('subscriptions: a recurring plan is not for sale through it, resync skips its rows', async () => {
    const { ctx, fake } = await managed({ without: ['subscriptions'] }, {
      seed: { 'payment-subscription': [{ id: 'row-1', entityId: ENTITY, planSku: PRO, productSku: PLANS_PRODUCT, service: 'app', paygate: 'fake', externalId: 'sub_1', status: SubscriptionStatus.Active, rank: 10, createdAt: past(5) }] },
    })
    await expect(paymentAccessOf(ctx).gateway().createLink(ctx, { productSku: PLANS_PRODUCT, planSku: PRO, entityId: ENTITY, service: 'app' }))
      .rejects.toThrow(`plan:${PRO}`)
    expect(await paymentAccessOf(ctx).gateway().resyncAll(ctx)).toEqual({ scanned: 0, updated: 0 })
    expect(fake.state.calls).toEqual([])
  })

  test('subscriptions, kept: a subscription the paygate no longer has is canceled by resync', async () => {
    const { ctx, observed } = await managed({}, {
      seed: { 'payment-subscription': [{ id: 'row-1', entityId: ENTITY, planSku: PRO, productSku: PLANS_PRODUCT, service: 'app', paygate: 'fake', externalId: 'sub_gone', status: SubscriptionStatus.Active, rank: 10, createdAt: past(5), propagated: { planSku: PRO, rank: 10, status: SubscriptionStatus.Active } }] },
    })
    expect(await paymentAccessOf(ctx).gateway().resyncAll(ctx)).toEqual({ scanned: 1, updated: 1 })
    expect(observed.subscription.map(event => event.change)).toEqual(['canceled'])
  })

  test('catalogue: a subscription checkout has no price to sell, and the product sync skips the paygate', async () => {
    const { ctx, fake } = await managed({ without: ['catalogue'] })
    await expect(paymentAccessOf(ctx).gateway().createLink(ctx, { productSku: PLANS_PRODUCT, planSku: PRO, entityId: ENTITY, service: 'app' }))
      .rejects.toBeInstanceOf(ProductError)
    await productSyncOf(ctx).syncPaymentProducts()
    expect(methods(fake)).not.toContain('catalogue.syncProduct')

    const sold = await managed({ state: { prices: { [PRO]: { id: 'price_pro', currency: 'usd', unitAmountMinor: 2_000, options: {} } } } })
    await paymentAccessOf(sold.ctx).gateway().createLink(sold.ctx, { productSku: PLANS_PRODUCT, planSku: PRO, entityId: ENTITY, service: 'app' })
    expect(sold.fake.state.sessions[0]).toEqual(expect.objectContaining({
      mode: 'subscription', line: { kind: 'subscription', priceId: 'price_pro' }, currency: 'usd', forceCurrency: false,
      subscriptionMetadata: { pricingMode: 'quantity', entityId: ENTITY, service: 'app', productSku: PLANS_PRODUCT, planSku: PRO },
    }))
  })

  test('fx: a charge in the settlement currency is refused without a rate; with one it is converted, rounded up', async () => {
    const plain = await managed({ without: ['fx'], state: { settlementCurrency: 'eur' } })
    await expect(paymentAccessOf(plain.ctx).gateway().createLink(plain.ctx, { productSku: CREDITS_PRODUCT, entityId: ENTITY, service: 'app', amountMinor: 1_000 }))
      .rejects.toThrow('paygate:fx-rate:usd:eur')

    const quoted = await managed({ state: { settlementCurrency: 'eur', quotes: { 'usd:eur': { from: 'usd', to: 'eur', exchangeRate: 0.88, baseRate: 0.9, referenceRate: 0.9 } } } })
    await paymentAccessOf(quoted.ctx).gateway().createLink(quoted.ctx, { productSku: CREDITS_PRODUCT, entityId: ENTITY, service: 'app', amountMinor: 1_000 })
    expect(quoted.fake.state.sessions[0].line).toEqual({ kind: 'amount', productSku: CREDITS_PRODUCT, currency: 'eur', unitAmountMinor: 919 })
  })

  test('portal: refused for the paygate; kept: the session names the entitling subscription', async () => {
    const seed = {
      'payment-paygate-customer': [{ id: 'customer-1', paygate: 'fake', externalId: 'cus_1', entityId: ENTITY }],
      'payment-subscription': [{ id: 'row-1', entityId: ENTITY, planSku: PRO, productSku: PLANS_PRODUCT, service: 'app', paygate: 'fake', externalId: 'sub_1', itemId: 'item_1', status: SubscriptionStatus.Active, rank: 10, createdAt: past(5) }],
    }
    const plain = await managed({ without: ['portal'] }, { seed })
    await expect(paymentAccessOf(plain.ctx).gateway().portalLink(plain.ctx, ENTITY, { flow: PortalFlow.Manage, returnUrl: successUrl }))
      .rejects.toBeInstanceOf(PortalUnavailable)

    const kept = await managed({}, { seed })
    await paymentAccessOf(kept.ctx).gateway().portalLink(kept.ctx, ENTITY, { flow: PortalFlow.Cancel, returnUrl: successUrl })
    expect(kept.fake.state.portalSessions).toEqual([expect.objectContaining({
      customerId: 'cus_1', flow: PortalFlow.Cancel, subscriptionId: 'sub_1', owner: 'app', returnUrl: successUrl,
    })])
    await expect(paymentAccessOf(kept.ctx).gateway().portalLink(kept.ctx, 'nobody', { flow: PortalFlow.Manage, returnUrl: successUrl }))
      .rejects.toThrow('portal-unavailable:customer')
  })

  test('tax: an estimate says at-checkout without a calculation', async () => {
    const plain = await managed({ without: ['tax'] })
    const estimate = await estimateOf(plain.ctx).estimatePrice({ productSku: CREDITS_PRODUCT, entityId: ENTITY, country: 'PL' }, makeEstimateCache())
    expect(estimate).toEqual(expect.objectContaining({ country: 'PL', source: 'request', currency: 'usd' }))
    expect(estimate.tax.status).toBe(TaxEstimateStatus.AtCheckout)
    expect(methods(plain.fake)).toEqual([])
  })

  test('payments: every withdrawal is left to an operator; no credit notes: a proportional refund on the payment', async () => {
    const opts = { consumerRights: RIGHTS, meter, seed: { 'payment-purchase': [purchaseRow()] } }
    const unpaid = await managed({ without: ['payments'] }, opts)
    const review = await paymentAccessOf(unpaid.ctx).consumerRights().withdraw({ entityId: ENTITY }, {
      purchaseId: 'fake:cs_1', name: 'Anna', email: 'anna@shop.eu', language: 'en',
    })
    expect(review.status).toBe(WithdrawalStatus.Review)
    expect(methods(unpaid.fake)).toEqual([])

    const plain = await managed({ without: ['creditNotes'] }, {
      ...opts, seed: { 'payment-purchase': [purchaseRow({ invoiceId: 'inv_1', invoiceLineId: 'line_1' })] },
    })
    const refunded = await paymentAccessOf(plain.ctx).consumerRights().withdraw({ entityId: ENTITY }, {
      purchaseId: 'fake:cs_1', name: 'Anna', email: 'anna@shop.eu', language: 'en',
    })
    expect(refunded).toEqual(expect.objectContaining({ status: WithdrawalStatus.Refunded, refundMinor: 1_000 }))
    expect(plain.fake.state.calls).toEqual([{
      method: 'payments.refund',
      args: [
        { paymentId: 'pay_1', amountMinor: 1_000, metadata: { withdrawalId: expect.any(String), purchaseId: 'fake:cs_1' } },
        { idempotencyKey: expect.stringMatching(/^withdrawal:.+:refund$/) },
      ],
    }])
  })

  test('listCompleted: the consumer-rights reconcile backfills nothing from the paygate', async () => {
    const plain = await managed({ without: ['listCompleted'] }, { consumerRights: RIGHTS })
    expect((await paymentAccessOf(plain.ctx).consumerRights().reconcile()).backfilled).toBe(0)
    expect(methods(plain.fake)).toEqual([])
  })
})
