import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { CancellationKind, PurchaseKind, WithdrawalStatus } from '@owlmeans/payment'
import { createEventHandler } from '../src/plugins/events.js'
import { gate, makeSuite, type Booted } from './context.js'
import {
  EUR_SETTLEMENT, FX, fixedMeter, invoiceOf, paidSession, requestStart, rightsOf, TEXT_VERSION,
} from './consumer-fixtures.js'
import { eventOf, makeFakeStripe, PRO, subscriptionOf } from './fake-stripe.js'
import { paymentAccessOf } from '../src/access.js'
import { paymentUtils } from '../src/utils.js'
import { productSyncOf } from '../src/sync.js'
import { consumerRecordsOf } from '../src/consumer/records.js'
import { captureOf } from '../src/consumer/capture.js'

const { stripe, state } = makeFakeStripe({ fxRates: FX })
const suite = makeSuite('payconsumer', {
  consumerRights: rightsOf(), pricing: EUR_SETTLEMENT, stripe, meter: fixedMeter({ granted: 1_000, used: 0, usedAfter: 0 }),
})
const it = gate.skip ? test.skip : test

const complete = async (booted: Booted, id: string, entityId: string, extra: Record<string, unknown> = {}) => {
  state.invoices[`in_${id}`] = invoiceOf(`in_${id}`, { payment_intent: `pi_${id}`, lines: { object: 'list', data: [{ id: `il_${id}` }] } })
  await createEventHandler(booted.ctx, stripe).process(eventOf('checkout.session.completed', paidSession({
    id: `cs_${id}`, invoice: `in_${id}`, payment_intent: `pi_${id}`, customer: `cus_${entityId}`,
    metadata: { entityId }, ...extra,
  })))
  const purchase = await paymentAccessOf(booted.ctx).purchases().load({ sessionId: `cs_${id}` })
  if (purchase == null) throw new Error('not captured')
  return purchase
}

describe('@owlmeans/server-payment — consumer-rights records on Mongo', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'mongo gate closed', () => {})
    return
  }

  let booted: Booted
  beforeAll(async () => { booted = await suite.boot() }, 60_000)
  afterAll(async () => { await suite.teardown() }, 60_000)

  it('stores every consumer-rights record and the new evidence fields through their collection validators', async () => {
    const { ctx } = booted
    const purchase = await complete(booted, 'v1', 'org-v')
    expect(purchase).toEqual(expect.objectContaining({ kind: PurchaseKind.TopUp, inScope: true, invoiceLineId: 'il_v1' }))
    expect(purchase.deadline).toBeInstanceOf(Date)
    expect(await paymentAccessOf(ctx).billingProfiles().byEntity('org-v')).toEqual(expect.objectContaining({ country: 'PL', currency: 'eur' }))
    expect(await paymentAccessOf(ctx).fulfillments().byExternalId('cs_v1', 'stripe')).toEqual(expect.objectContaining({
      country: 'PL', purchaseId: purchase.purchaseId, termsAccepted: true, amountTotalMinor: 1_130,
    }))

    const consent = await paymentAccessOf(ctx).consumerRights().recordConsent({ entityId: 'org-v', email: 'owner@shop.eu' }, {
      purchaseIds: [purchase.purchaseId], textVersion: TEXT_VERSION, language: 'pl', acknowledged: true,
    }, { ip: '203.0.113.1', userAgent: 'agent', ipCountry: 'PL', acceptLanguage: 'pl' })
    expect(await paymentAccessOf(ctx).consumerConsents().load(consent.consentId)).toEqual(expect.objectContaining({ kind: 'performance', ip: '203.0.113.1' }))
    expect((await paymentAccessOf(ctx).purchases().byPurchaseId(purchase.purchaseId))?.consentedAt).toBeInstanceOf(Date)

    const startRequestId = await requestStart({ ctx } as never, { planSku: PRO })
    expect((await paymentAccessOf(ctx).consumerConsents().load(startRequestId))?.expiresAt).toBeInstanceOf(Date)

    const receipt = await paymentAccessOf(ctx).consumerRights().withdraw({ entityId: 'org-v' }, {
      purchaseId: purchase.purchaseId, name: 'Jan', email: 'owner@shop.eu',
    })
    expect(receipt.status).toBe(WithdrawalStatus.Refunded)
    expect(await paymentAccessOf(ctx).consumerDeclarations().load(receipt.declarationId)).toEqual(expect.objectContaining({ matched: true }))
    expect(await paymentAccessOf(ctx).consumerEvents().count({ recordId: receipt.declarationId, action: 'refund', ok: true })).toBe(1)

    const subscription = subscriptionOf({ id: 'sub_v', customer: 'cus_org-v', entityId: 'org-v' }) as unknown as Record<string, any>
    subscription.currency = 'eur'
    state.subscriptions.sub_v = subscription as never
    await createEventHandler(ctx, stripe).process(eventOf('customer.subscription.updated', subscription))
    const cancelled = await paymentAccessOf(ctx).consumerRights().cancel({ entityId: 'org-v' }, {
      kind: CancellationKind.Ordinary, name: 'Jan', email: 'owner@shop.eu', effective: 'earliest',
    })
    expect(await paymentAccessOf(ctx).consumerDeclarations().load(cancelled.declarationId)).toEqual(expect.objectContaining({ kind: 'cancellation' }))
    expect((await paymentAccessOf(ctx).subscriptions().byExternalId('sub_v', 'stripe'))?.currency).toBe('eur')

    await productSyncOf(ctx).syncStripeProducts(stripe)
    const row = await paymentAccessOf(ctx).fingerprints().bySku('app-plans')
    expect(row?.prices?.find(price => price.planSku === PRO)?.options).toEqual([{ currency: 'usd', unitAmount: 2_000 }])
    expect(await paymentAccessOf(ctx).payment().consumerRightsPolicy()).not.toBeNull()
  }, 60_000)

  it('keeps one purchase per id and contract reference, one profile per organization', async () => {
    const { ctx } = booted
    const purchase = await complete(booted, 'u1', 'org-u')
    const { id: _id, ...copy } = purchase
    const again = await paymentAccessOf(ctx).purchases().create({ ...copy, contractRef: 'CR-000000-UNIQUE' }).catch(error => error)
    expect(paymentUtils.isDuplicateKey(again)).toBe(true)
    const sameRef = await paymentAccessOf(ctx).purchases().create({ ...copy, purchaseId: 'stripe:other', sessionId: 'cs_other' }).catch(error => error)
    expect(paymentUtils.isDuplicateKey(sameRef)).toBe(true)
    // Subscription purchases have no session yet: the sparse unique index lets them coexist.
    for (const id of ['sub_a', 'sub_b']) {
      const { sessionId: _session, invoiceId: _invoice, ...rest } = copy
      await paymentAccessOf(ctx).purchases().create({ ...rest, purchaseId: `stripe:${id}`, contractRef: `CR-000000-${id.toUpperCase().replace('_', '')}X`, subscriptionId: id })
    }
    const profile = await paymentAccessOf(ctx).billingProfiles().byEntity('org-u')
    const { id: _pid, ...profileCopy } = profile!
    expect(paymentUtils.isDuplicateKey(await paymentAccessOf(ctx).billingProfiles().create(profileCopy).catch(error => error))).toBe(true)
  }, 60_000)

  it('the first of concurrent locks wins; the others are mismatch events, never relocks', async () => {
    const { ctx } = booted
    const policy = await paymentAccessOf(ctx).payment().consumerRightsPolicy()
    const countries = ['DE', 'FR', 'PL', 'ES', 'IT', 'NL', 'AT', 'BE']
    const results = await Promise.all(countries.map(country => consumerRecordsOf(ctx).lockProfile(policy, { entityId: 'org-race', country, source: 'checkout' })))
    expect(results.filter(result => result.created)).toHaveLength(1)
    const winner = (await paymentAccessOf(ctx).billingProfiles().byEntity('org-race'))!.country
    expect(results.every(result => result.record.country === winner)).toBe(true)
    expect(await paymentAccessOf(ctx).consumerEvents().count({ recordId: 'org-race', action: 'lock-mismatch' })).toBe(countries.length - 1)
  }, 60_000)

  it('stores the confirmation claim, an unlock and a terms fallback through their validators', async () => {
    const { ctx } = booted
    const purchase = await complete(booted, 'l1', 'org-l')
    expect(purchase.confirmationMailAt).toBeInstanceOf(Date)

    // Two processes capturing one session: one claim, one mail attempt.
    state.invoices.in_l2 = invoiceOf('in_l2', { payment_intent: 'pi_l2', lines: { object: 'list', data: [{ id: 'il_l2' }] } })
    const session = paidSession({ id: 'cs_l2', invoice: 'in_l2', payment_intent: 'pi_l2', customer: 'cus_org-l', metadata: { entityId: 'org-l' } })
    await Promise.all([captureOf(ctx).capturePaymentPurchase(stripe, session as never), captureOf(ctx).capturePaymentPurchase(stripe, session as never)])
    expect(await paymentAccessOf(ctx).consumerEvents().count({ recordId: 'stripe:cs_l2', action: 'mail', step: 'purchase' })).toBe(1)

    expect(await paymentAccessOf(ctx).consumerRights().unlock('org-l', { by: 'operator', reason: 'integration' }))
      .toEqual(expect.objectContaining({ country: 'PL' }))
    expect(await paymentAccessOf(ctx).billingProfiles().byEntity('org-l')).toBeNull()
    expect(await paymentAccessOf(ctx).consumerEvents().count({ recordId: 'org-l', action: 'unlock', ok: true })).toBe(1)

    await consumerRecordsOf(ctx).recordEvent({
      recordId: 'org-l', recordKind: 'checkout', entityId: 'org-l', action: 'checkout-terms-fallback', ok: false,
      externalId: 'cs_l3', detail: '{"param":"consent_collection[terms_of_service]"}',
    })
    expect(await paymentAccessOf(ctx).consumerEvents().count({ recordId: 'org-l', action: 'checkout-terms-fallback' })).toBe(1)
  }, 60_000)

  it('only one of concurrent withdrawals of a purchase closes its window and refunds', async () => {
    const { ctx } = booted
    const purchase = await complete(booted, 'r1', 'org-r')
    const refundsBefore = state.refunds.length
    const receipts = await Promise.all(Array.from({ length: 5 }, async () => await paymentAccessOf(ctx).consumerRights().withdraw({ entityId: 'org-r' }, {
      purchaseId: purchase.purchaseId, name: 'Jan', email: 'owner@shop.eu',
    })))
    expect(state.refunds.length - refundsBefore).toBe(1)
    const closed = await paymentAccessOf(ctx).purchases().byPurchaseId(purchase.purchaseId)
    expect(receipts.every(receipt => receipt.declarationId === closed?.withdrawalId)).toBe(true)
  }, 60_000)
})
