import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { CancellationKind, PurchaseKind, WithdrawalStatus } from '@owlmeans/payment'
import { capturePaymentPurchase } from '../src/consumer/capture.js'
import { lockProfile, recordEvent } from '../src/consumer/records.js'
import { createEventHandler } from '../src/plugins/events.js'
import { syncStripeProducts } from '../src/sync.js'
import {
  billingProfiles, consumerConsents, consumerDeclarations, consumerEvents, consumerRights, fingerprints,
  fulfillments, isDuplicateKey, payment, purchases, subscriptions,
} from '../src/utils.js'
import { gate, makeSuite } from './context.js'
import type { Booted } from './context.js'
import {
  EUR_SETTLEMENT, FX, fixedMeter, invoiceOf, paidSession, requestStart, rightsOf, TEXT_VERSION,
} from './consumer-fixtures.js'
import { eventOf, makeFakeStripe, PRO, subscriptionOf } from './fake-stripe.js'

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
  const purchase = await purchases(booted.ctx).load({ sessionId: `cs_${id}` })
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
    expect(await billingProfiles(ctx).byEntity('org-v')).toEqual(expect.objectContaining({ country: 'PL', currency: 'eur' }))
    expect(await fulfillments(ctx).byExternalId('cs_v1', 'stripe')).toEqual(expect.objectContaining({
      country: 'PL', purchaseId: purchase.purchaseId, termsAccepted: true, amountTotalMinor: 1_130,
    }))

    const consent = await consumerRights(ctx).recordConsent({ entityId: 'org-v', email: 'owner@shop.eu' }, {
      purchaseIds: [purchase.purchaseId], textVersion: TEXT_VERSION, language: 'pl', acknowledged: true,
    }, { ip: '203.0.113.1', userAgent: 'agent', ipCountry: 'PL', acceptLanguage: 'pl' })
    expect(await consumerConsents(ctx).load(consent.consentId)).toEqual(expect.objectContaining({ kind: 'performance', ip: '203.0.113.1' }))
    expect((await purchases(ctx).byPurchaseId(purchase.purchaseId))?.consentedAt).toBeInstanceOf(Date)

    const startRequestId = await requestStart({ ctx } as never, { planSku: PRO })
    expect((await consumerConsents(ctx).load(startRequestId))?.expiresAt).toBeInstanceOf(Date)

    const receipt = await consumerRights(ctx).withdraw({ entityId: 'org-v' }, {
      purchaseId: purchase.purchaseId, name: 'Jan', email: 'owner@shop.eu',
    })
    expect(receipt.status).toBe(WithdrawalStatus.Refunded)
    expect(await consumerDeclarations(ctx).load(receipt.declarationId)).toEqual(expect.objectContaining({ matched: true }))
    expect(await consumerEvents(ctx).count({ recordId: receipt.declarationId, action: 'refund', ok: true })).toBe(1)

    const subscription = subscriptionOf({ id: 'sub_v', customer: 'cus_org-v', entityId: 'org-v' }) as unknown as Record<string, any>
    subscription.currency = 'eur'
    state.subscriptions.sub_v = subscription as never
    await createEventHandler(ctx, stripe).process(eventOf('customer.subscription.updated', subscription))
    const cancelled = await consumerRights(ctx).cancel({ entityId: 'org-v' }, {
      kind: CancellationKind.Ordinary, name: 'Jan', email: 'owner@shop.eu', effective: 'earliest',
    })
    expect(await consumerDeclarations(ctx).load(cancelled.declarationId)).toEqual(expect.objectContaining({ kind: 'cancellation' }))
    expect((await subscriptions(ctx).byExternalId('sub_v', 'stripe'))?.currency).toBe('eur')

    await syncStripeProducts(ctx, stripe)
    const row = await fingerprints(ctx).bySku('app-plans')
    expect(row?.prices?.find(price => price.planSku === PRO)?.options).toEqual([{ currency: 'usd', unitAmount: 2_000 }])
    expect(await payment(ctx).consumerRightsPolicy()).not.toBeNull()
  }, 60_000)

  it('keeps one purchase per id and contract reference, one profile per organization', async () => {
    const { ctx } = booted
    const purchase = await complete(booted, 'u1', 'org-u')
    const { id: _id, ...copy } = purchase
    const again = await purchases(ctx).create({ ...copy, contractRef: 'CR-000000-UNIQUE' }).catch(error => error)
    expect(isDuplicateKey(again)).toBe(true)
    const sameRef = await purchases(ctx).create({ ...copy, purchaseId: 'stripe:other', sessionId: 'cs_other' }).catch(error => error)
    expect(isDuplicateKey(sameRef)).toBe(true)
    // Subscription purchases have no session yet: the sparse unique index lets them coexist.
    for (const id of ['sub_a', 'sub_b']) {
      const { sessionId: _session, invoiceId: _invoice, ...rest } = copy
      await purchases(ctx).create({ ...rest, purchaseId: `stripe:${id}`, contractRef: `CR-000000-${id.toUpperCase().replace('_', '')}X`, subscriptionId: id })
    }
    const profile = await billingProfiles(ctx).byEntity('org-u')
    const { id: _pid, ...profileCopy } = profile!
    expect(isDuplicateKey(await billingProfiles(ctx).create(profileCopy).catch(error => error))).toBe(true)
  }, 60_000)

  it('the first of concurrent locks wins; the others are mismatch events, never relocks', async () => {
    const { ctx } = booted
    const policy = await payment(ctx).consumerRightsPolicy()
    const countries = ['DE', 'FR', 'PL', 'ES', 'IT', 'NL', 'AT', 'BE']
    const results = await Promise.all(countries.map(country => lockProfile(ctx, policy, { entityId: 'org-race', country, source: 'checkout' })))
    expect(results.filter(result => result.created)).toHaveLength(1)
    const winner = (await billingProfiles(ctx).byEntity('org-race'))!.country
    expect(results.every(result => result.record.country === winner)).toBe(true)
    expect(await consumerEvents(ctx).count({ recordId: 'org-race', action: 'lock-mismatch' })).toBe(countries.length - 1)
  }, 60_000)

  it('stores the confirmation claim, an unlock and a terms fallback through their validators', async () => {
    const { ctx } = booted
    const purchase = await complete(booted, 'l1', 'org-l')
    expect(purchase.confirmationMailAt).toBeInstanceOf(Date)

    // Two processes capturing one session: one claim, one mail attempt.
    state.invoices.in_l2 = invoiceOf('in_l2', { payment_intent: 'pi_l2', lines: { object: 'list', data: [{ id: 'il_l2' }] } })
    const session = paidSession({ id: 'cs_l2', invoice: 'in_l2', payment_intent: 'pi_l2', customer: 'cus_org-l', metadata: { entityId: 'org-l' } })
    await Promise.all([capturePaymentPurchase(ctx, stripe, session as never), capturePaymentPurchase(ctx, stripe, session as never)])
    expect(await consumerEvents(ctx).count({ recordId: 'stripe:cs_l2', action: 'mail', step: 'purchase' })).toBe(1)

    expect(await consumerRights(ctx).unlock('org-l', { by: 'operator', reason: 'integration' }))
      .toEqual(expect.objectContaining({ country: 'PL' }))
    expect(await billingProfiles(ctx).byEntity('org-l')).toBeNull()
    expect(await consumerEvents(ctx).count({ recordId: 'org-l', action: 'unlock', ok: true })).toBe(1)

    await recordEvent(ctx, {
      recordId: 'org-l', recordKind: 'checkout', entityId: 'org-l', action: 'checkout-terms-fallback', ok: false,
      externalId: 'cs_l3', detail: '{"param":"consent_collection[terms_of_service]"}',
    })
    expect(await consumerEvents(ctx).count({ recordId: 'org-l', action: 'checkout-terms-fallback' })).toBe(1)
  }, 60_000)

  it('only one of concurrent withdrawals of a purchase closes its window and refunds', async () => {
    const { ctx } = booted
    const purchase = await complete(booted, 'r1', 'org-r')
    const refundsBefore = state.refunds.length
    const receipts = await Promise.all(Array.from({ length: 5 }, async () => await consumerRights(ctx).withdraw({ entityId: 'org-r' }, {
      purchaseId: purchase.purchaseId, name: 'Jan', email: 'owner@shop.eu',
    })))
    expect(state.refunds.length - refundsBefore).toBe(1)
    const closed = await purchases(ctx).byPurchaseId(purchase.purchaseId)
    expect(receipts.every(receipt => receipt.declarationId === closed?.withdrawalId)).toBe(true)
  }, 60_000)
})
