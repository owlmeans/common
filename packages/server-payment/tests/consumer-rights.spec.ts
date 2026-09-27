import { describe, expect, test } from 'bun:test'
import {
  CancellationKind, CancellationStatus, CancellationUnavailable, LimitKind, PerformanceConsentRequired,
  PlanDuration, WithdrawalStatus, WithdrawalUnavailable,
} from '@owlmeans/payment'
import {
  consumerDeclarations, consumerEvents, consumerRights, paygateCustomers, purchases, subscriptions,
} from '../src/utils.js'
import type { PaymentPlanDef, PurchaseRecord } from '../src/types.js'
import {
  buyTopUp, ENTITY, fixedMeter, invoiceOf, makeRightsContext, PLANS_PRODUCT, requestStart, rightsOf, send,
  TEXT_VERSION,
} from './consumer-fixtures.js'
import type { RecordingMeter } from './consumer-fixtures.js'
import { future, past, subscriptionOf } from './fake-stripe.js'
import type { FakeContext, FakeContextOptions } from './fake-stripe.js'

const SPLIT = 'pro-split'
/** A plan whose price is services (by time) and included credits (by units), equal halves. */
const SPLIT_PLAN: PaymentPlanDef = {
  productSku: PLANS_PRODUCT, sku: SPLIT, duration: PlanDuration.Monthly, rank: 15, price: 20, title: 'Pro split',
  recurring: { interval: 'month' },
  limits: { seats: { kind: LimitKind.Occupancy, limit: 3 } },
  withdrawal: { components: [{ key: 'services', basis: 'time', shareMinor: 1_000 }, { key: 'credits', basis: 'units', shareMinor: 1_000 }] },
}

const withMeter = async (meter: RecordingMeter, opts: FakeContextOptions = {}) =>
  await makeRightsContext({ meter, catalogue: { plans: [SPLIT_PLAN] }, ...opts })

const service = (fake: FakeContext) => consumerRights(fake.ctx)
const subject = { entityId: ENTITY, email: 'owner@shop.eu', name: 'Anna Nowak', profileId: 'profile-1' }
const events = async (fake: FakeContext, recordId: string) => (await consumerEvents(fake.ctx).list({ recordId })).items
const consent = async (fake: FakeContext, purchase: PurchaseRecord, language = 'de') =>
  await service(fake).recordConsent(subject, {
    purchaseIds: [purchase.purchaseId], textVersion: TEXT_VERSION, language, acknowledged: true, uiLanguage: 'en',
  }, { ip: '198.51.100.1', userAgent: 'test-agent', ipCountry: 'PL' })

describe('consumer rights — performance consent', () => {
  test('an open in-scope window needs consent; the view names the purchase, deadline and billing language', async () => {
    const fake = await makeRightsContext()
    const purchase = await buyTopUp(fake)
    const view = await service(fake).consentView(ENTITY)
    expect(view).toEqual(expect.objectContaining({
      required: true, region: 'eu', country: 'PL', language: 'pl', trader: 'Example', textVersion: TEXT_VERSION,
    }))
    expect(view.purchases.map(item => item.purchaseId)).toEqual([purchase.purchaseId])
    expect(view.deadline).toEqual(purchase.deadline)
    expect(view.links.billingTerms).toBe('https://legal.example.com/pl/billing')

    const refusal = await service(fake).assertConsent(ENTITY).catch(error => error)
    expect(refusal).toBeInstanceOf(PerformanceConsentRequired)
    expect((refusal.constructor as { httpStatus: number }).httpStatus).toBe(428)
    expect(refusal).toEqual(expect.objectContaining({ pending: 1, deadline: purchase.deadline }))
  })

  test('a stale text version is asked again; a recorded consent stamps the window and is mailed verbatim', async () => {
    const fake = await makeRightsContext()
    const purchase = await buyTopUp(fake)
    await expect(service(fake).recordConsent(subject, {
      purchaseIds: [purchase.purchaseId], textVersion: 'terms-v0', language: 'de', acknowledged: true,
    })).rejects.toBeInstanceOf(PerformanceConsentRequired)

    const response = await consent(fake, purchase)
    expect(response).toEqual(expect.objectContaining({ purchaseIds: [purchase.purchaseId], mailed: true }))
    await service(fake).assertConsent(ENTITY)
    expect((await purchases(fake.ctx).byPurchaseId(purchase.purchaseId))).toEqual(expect.objectContaining({
      consentId: response.consentId, consentedAt: response.consentedAt,
    }))
    const record = fake.stores['payment-consumer-consent'].rows.find(row => row.id === response.consentId)
    expect(record).toEqual(expect.objectContaining({
      kind: 'performance', language: 'de', uiLanguage: 'en', trader: 'Example', ip: '198.51.100.1',
      userAgent: 'test-agent', ipCountry: 'PL', email: 'owner@shop.eu',
    }))
    expect(record?.text.checkbox).toContain('Ich verlange ausdrücklich')
    const mail = fake.mails.find(item => item.to === 'owner@shop.eu')
    expect(mail?.text).toContain(record?.text.checkbox)
    expect(mail?.text).toContain(purchase.contractRef)
    expect(mail?.text).toContain('bis einschließlich')
    expect(fake.observed.consent).toEqual([expect.objectContaining({
      kind: 'performance', consentId: response.consentId, eventKey: `consent:${response.consentId}`,
    })])
  })

  test('a consent covers only what it was shown; a purchase outside the territories never needs one', async () => {
    const fake = await makeRightsContext()
    const first = await buyTopUp(fake)
    await buyTopUp(fake, { id: 'cs_2', invoice: 'in_2' })
    await consent(fake, first)
    await expect(service(fake).assertConsent(ENTITY)).rejects.toBeInstanceOf(PerformanceConsentRequired)

    const other = await makeRightsContext()
    await buyTopUp(other, {
      id: 'cs_us', invoice: 'in_us', currency: 'usd', amount_subtotal: 1_021, amount_total: 1_021,
      customer_details: { address: { country: 'US' } }, metadata: { country: 'US', currency: 'usd', chargeAmountMinor: '1021' },
    })
    await service(other).assertConsent(ENTITY)
    expect((await service(other).consentView(ENTITY)).required).toBe(false)
  })
})

describe('consumer rights — withdrawal of a top-up', () => {
  test('before consent nothing is deductible: the whole payment comes back, through a credit note', async () => {
    const meter = fixedMeter({ granted: 1_000, used: 400, usedAfter: 0 })
    const fake = await withMeter(meter)
    const purchase = await buyTopUp(fake)
    const candidates = await service(fake).withdrawalCandidates(ENTITY, subject)
    expect(candidates.candidates).toEqual([expect.objectContaining({
      purchaseId: purchase.purchaseId, automatic: true, estimate: expect.objectContaining({ refundMinor: 1_130 }),
    })])

    const receipt = await service(fake).withdraw(subject, { purchaseId: purchase.purchaseId, name: 'Anna Nowak', email: 'owner@shop.eu' })
    expect(receipt).toEqual(expect.objectContaining({ status: WithdrawalStatus.Refunded, refundMinor: 1_130, currency: 'eur' }))
    expect(receipt.content).toEqual({ name: 'Anna Nowak', contract: purchase.contractRef, email: 'owner@shop.eu' })
    expect(meter.queries[0]).toEqual(expect.objectContaining({ entityId: ENTITY }))
    expect(meter.queries[0].after).toBeUndefined()

    const id = receipt.declarationId
    expect(fake.state.creditNotePreviews[0]).toEqual({
      invoice: 'in_pl', lines: [{ type: 'invoice_line_item', invoice_line_item: 'il_pl', amount: 919 }],
    })
    expect(fake.state.refunds[0]).toEqual(expect.objectContaining({
      amount: 1_130, payment_intent: 'pi_pl', reason: 'requested_by_customer',
      metadata: { owlmeans: 'payment', withdrawalId: id, purchaseId: purchase.purchaseId },
    }))
    expect(fake.state.requestOptions['refunds.create']).toEqual([{ idempotencyKey: `withdrawal:${id}:refund` }])
    expect(fake.state.creditNotes[0]).toEqual(expect.objectContaining({ invoice: 'in_pl', refund: fake.state.refunds[0].id }))
    expect(fake.state.requestOptions['creditNotes.create']).toEqual([{ idempotencyKey: `withdrawal:${id}:credit-note` }])
    expect((await purchases(fake.ctx).byPurchaseId(purchase.purchaseId))).toEqual(expect.objectContaining({ withdrawalId: id }))
    expect(fake.observed.withdrawal).toEqual([expect.objectContaining({
      withdrawalId: id, eventKey: `withdrawal:${id}`, status: WithdrawalStatus.Refunded, channel: 'in-app',
      units: { granted: 1_000, used: 0, returned: 600 },
      refund: expect.objectContaining({ amountMinor: 1_130, refundId: fake.state.refunds[0].id, creditNoteId: fake.state.creditNotes[0].id }),
    })])
    expect((await events(fake, id)).map(event => [event.action, event.ok])).toEqual(expect.arrayContaining([
      ['computed', true], ['mail', true], ['refund', true], ['credit-note', true], ['observers', true],
    ]))
    // The window closed: no consent is asked for a withdrawn purchase.
    await service(fake).assertConsent(ENTITY)
  })

  test('after consent the deduction is usage after consent, settled debt and earlier claw-backs', async () => {
    const meter = fixedMeter({ granted: 1_000, used: 500, usedAfter: 250, settled: 50, clawed: 100 })
    const fake = await withMeter(meter)
    const purchase = await buyTopUp(fake)
    await consent(fake, purchase)
    fake.stores['payment-purchase'].rows.find(row => row.purchaseId === purchase.purchaseId)!.refundedMinor = 113
    const receipt = await service(fake).withdraw(subject, { purchaseId: purchase.purchaseId, name: 'Anna', email: 'owner@shop.eu' })
    // net: min(919 − 91, ceil(919 × 600 / 1000)) = 552; the credit note adds its tax → 679.
    expect(fake.state.creditNotePreviews[0].lines[0].amount).toBe(552)
    expect(fake.state.refunds[0].amount).toBe(679)
    expect(receipt.refundMinor).toBe(679)
    expect(meter.queries[0].after).toBeInstanceOf(Date)
    expect(fake.observed.withdrawal[0].units).toEqual({ granted: 1_000, used: 400, returned: 350 })
  })

  test('no invoice: a plain proportional refund; a failed preview falls back to it too', async () => {
    const meter = fixedMeter({ granted: 1_000, used: 0, usedAfter: 0 })
    const fake = await withMeter(meter)
    const plain = await buyTopUp(fake, { id: 'cs_old', invoice: null })
    await service(fake).withdraw(subject, { purchaseId: plain.purchaseId, name: 'Anna', email: 'owner@shop.eu' })
    expect(fake.state.calls).not.toContain('creditNotes.preview')
    expect(fake.state.refunds[0].amount).toBe(1_130)

    const again = await withMeter(fixedMeter({ granted: 1_000, used: 0, usedAfter: 0 }))
    const purchase = await buyTopUp(again)
    again.state.failures['creditNotes.preview'] = 'invoice_not_finalized'
    const receipt = await service(again).withdraw(subject, { purchaseId: purchase.purchaseId, name: 'Anna', email: 'owner@shop.eu' })
    expect(receipt.status).toBe(WithdrawalStatus.Refunded)
    expect(again.state.refunds[0].amount).toBe(1_130)
    expect(again.state.calls).not.toContain('creditNotes.create')
    expect((await events(again, receipt.declarationId)).find(event => event.action === 'credit-note')).toEqual(
      expect.objectContaining({ ok: false, step: 'preview' }))
  })

  test('a credit note refused after the refund keeps the refund; reconcile issues it, linked to that refund', async () => {
    const fake = await withMeter(fixedMeter({ granted: 1_000, used: 0, usedAfter: 0 }))
    const purchase = await buyTopUp(fake)
    fake.state.failures['creditNotes.create'] = 'rate_limit'
    const receipt = await service(fake).withdraw(subject, { purchaseId: purchase.purchaseId, name: 'Anna', email: 'owner@shop.eu' })
    expect(receipt.status).toBe(WithdrawalStatus.Refunded)
    expect(fake.state.creditNotes).toHaveLength(0)

    const result = await service(fake).reconcile()
    expect(result.retried).toBe(1)
    expect(fake.state.creditNotes).toEqual([expect.objectContaining({ refund: fake.state.refunds[0].id })])
    expect(fake.state.requestOptions['creditNotes.create'].at(-1)).toEqual({
      idempotencyKey: `withdrawal:${receipt.declarationId}:credit-note:1`,
    })
    expect(fake.state.refunds).toHaveLength(1)
  })

  test('a failed refund is retried by reconcile under a fresh key, adopting nothing twice; observers then run', async () => {
    const fake = await withMeter(fixedMeter({ granted: 1_000, used: 0, usedAfter: 0 }))
    const purchase = await buyTopUp(fake)
    fake.state.failures['refunds.create'] = 'card_declined'
    const receipt = await service(fake).withdraw(subject, { purchaseId: purchase.purchaseId, name: 'Anna', email: 'owner@shop.eu' })
    expect(receipt.status).toBe(WithdrawalStatus.Failed)
    expect(fake.observed.withdrawal).toHaveLength(0)
    // The window is closed although the paygate failed: the declaration was made.
    expect((await purchases(fake.ctx).byPurchaseId(purchase.purchaseId))?.withdrawnAt).toBeInstanceOf(Date)

    await service(fake).reconcile()
    expect(fake.state.refunds).toHaveLength(1)
    expect(fake.state.requestOptions['refunds.create'].at(-1)).toEqual({ idempotencyKey: `withdrawal:${receipt.declarationId}:refund:1` })
    expect(fake.observed.withdrawal).toEqual([expect.objectContaining({ status: WithdrawalStatus.Refunded })])
    await service(fake).reconcile()
    expect(fake.state.refunds).toHaveLength(1)
    expect(fake.observed.withdrawal).toHaveLength(1)
  })

  test('credits fully used after consent: the right has expired, nothing is offered or executed', async () => {
    const fake = await withMeter(fixedMeter({ granted: 1_000, used: 1_000, usedAfter: 1_000 }))
    const purchase = await buyTopUp(fake)
    await consent(fake, purchase)
    expect((await service(fake).withdrawalCandidates(ENTITY)).candidates).toHaveLength(0)
    const refusal = await service(fake).withdraw(subject, { purchaseId: purchase.purchaseId, name: 'Anna', email: 'owner@shop.eu' })
      .catch(error => error)
    expect(refusal).toBeInstanceOf(WithdrawalUnavailable)
    expect(refusal.reason).toBe('performed')
    expect(fake.stores['payment-consumer-declaration'].rows).toHaveLength(0)
  })

  test('without a meter a withdrawal is recorded and left to an operator, promising the reimbursement', async () => {
    const fake = await makeRightsContext()
    const purchase = await buyTopUp(fake)
    const receipt = await service(fake).withdraw(subject, { purchaseId: purchase.purchaseId, name: 'Anna', email: 'owner@shop.eu', language: 'en' })
    expect(receipt.status).toBe(WithdrawalStatus.Review)
    expect(fake.state.calls).not.toContain('refunds.create')
    expect(fake.observed.withdrawal).toEqual([expect.objectContaining({ status: WithdrawalStatus.Review, units: null })])
    const mail = fake.mails.find(item => item.subject.includes('withdrawal') && item.to === 'owner@shop.eu')
    expect(mail?.text).toContain('not later than 14 days')
  })

  test('a repeated declaration answers the original receipt and executes nothing again', async () => {
    const fake = await withMeter(fixedMeter({ granted: 1_000, used: 0, usedAfter: 0 }))
    const purchase = await buyTopUp(fake)
    const first = await service(fake).withdraw(subject, { purchaseId: purchase.purchaseId, name: 'Anna', email: 'owner@shop.eu' })
    const second = await service(fake).withdraw(subject, { purchaseId: purchase.purchaseId, name: 'Anna', email: 'owner@shop.eu' })
    expect(second.declarationId).toBe(first.declarationId)
    expect(second.status).toBe(WithdrawalStatus.Refunded)
    expect(fake.state.refunds).toHaveLength(1)
    const rows = fake.stores['payment-consumer-declaration'].rows
    expect(rows).toHaveLength(2)
    expect(rows[1].duplicateOf).toBe(first.declarationId)
  })

  test('a late declaration is recorded as expired, its receipt names the last day, nothing is executed', async () => {
    const fake = await withMeter(fixedMeter({ granted: 1_000, used: 0, usedAfter: 0 }))
    const purchase = await buyTopUp(fake)
    fake.stores['payment-purchase'].rows.find(row => row.purchaseId === purchase.purchaseId)!.deadline = new Date('2026-01-13T00:00:00.000Z')
    const receipt = await service(fake).withdraw(subject, { purchaseId: purchase.purchaseId, name: 'Anna', email: 'owner@shop.eu', language: 'en' })
    expect(receipt.status).toBe(WithdrawalStatus.Expired)
    expect(fake.state.calls).not.toContain('refunds.create')
    expect(fake.mails.find(item => item.to === 'owner@shop.eu')?.text).toContain('January 12, 2026')
    expect((await purchases(fake.ctx).byPurchaseId(purchase.purchaseId))?.withdrawnAt).toBeUndefined()
  })

  test('in-app refusals: an unknown contract, a purchase outside the territories', async () => {
    const fake = await withMeter(fixedMeter({ granted: 1_000 }))
    await expect(service(fake).withdraw(subject, { purchaseId: 'stripe:cs_none', name: 'A', email: 'a@shop.eu' }))
      .rejects.toBeInstanceOf(WithdrawalUnavailable)
    const us = await buyTopUp(fake, {
      id: 'cs_us', invoice: 'in_us', customer_details: { address: { country: 'US' } }, metadata: { country: 'US' },
    })
    const refusal = await service(fake).withdraw(subject, { purchaseId: us.purchaseId, name: 'A', email: 'a@shop.eu' }).catch(error => error)
    expect(refusal.reason).toBe('not-in-scope')
  })
})

describe('consumer rights — withdrawal of a subscription', () => {
  test('services by time from the start request, credits by units; the subscription ends at once', async () => {
    const meter = fixedMeter({ granted: 1_000, used: 300, usedAfter: 100 })
    const fake = await withMeter(meter)
    fake.state.invoices.in_sub = invoiceOf('in_sub', {
      subtotal: 1_800, tax: 342, total: 2_142, payment_intent: 'pi_sub', lines: { object: 'list', data: [{ id: 'il_sub' }] },
      customer_address: { country: 'DE' },
    })
    const startRequestId = await requestStart(fake, { planSku: SPLIT })
    const subscription = subscriptionOf({
      id: 'sub_split', planSku: SPLIT, latestInvoice: 'in_sub', periodStart: past(3), periodEnd: future(27),
    }) as unknown as Record<string, any>
    subscription.currency = 'eur'
    subscription.items.data[0].price.unit_amount = 1_800
    subscription.metadata = { entityId: ENTITY, planSku: SPLIT, startRequestId, country: 'DE' }
    fake.state.subscriptions.sub_split = subscription as never
    await send(fake, 'customer.subscription.created', subscription)
    const row = fake.stores['payment-purchase'].rows.find(item => item.purchaseId === 'stripe:sub_split')!
    row.servicesStartedAt = past(3)
    row.consentedAt = past(3)

    const receipt = await service(fake).withdraw(subject, { purchaseId: 'stripe:sub_split', name: 'Anna', email: 'owner@shop.eu' })
    // net 1800 = 900 services + 900 credits; −90 (3 of 30 days) −90 (100 of 1000 units) → 1620 net → 1928 gross.
    expect(fake.state.creditNotePreviews[0].lines[0].amount).toBe(1_620)
    expect(receipt).toEqual(expect.objectContaining({ status: WithdrawalStatus.Refunded, refundMinor: 1_928, subscriptionCanceled: true }))
    expect(fake.state.subscriptionChanges).toEqual([expect.objectContaining({
      id: 'sub_split', method: 'cancel', prorate: false, invoice_now: false,
      cancellation_details: { comment: `withdrawal:${receipt.declarationId}` },
    })])
    expect(fake.state.requestOptions['subscriptions.cancel']).toEqual([{ idempotencyKey: `withdrawal:${receipt.declarationId}:subscription-cancel` }])
    expect((await subscriptions(fake.ctx).byExternalId('sub_split', 'stripe'))?.withdrawnAt).toBeInstanceOf(Date)
    const estimate = (await events(fake, receipt.declarationId)).find(event => event.action === 'computed')
    expect(JSON.parse(estimate?.detail ?? '{}').estimate).toEqual(expect.objectContaining({
      timeDeductionMinor: 90, unitsDeductionMinor: 90, elapsedDays: 3, periodDays: 30,
    }))
  })
})

describe('consumer rights — the public withdrawal function', () => {
  test('matched by contract reference and e-mail: executed, answered without status, amount or match', async () => {
    const fake = await withMeter(fixedMeter({ granted: 1_000, used: 0, usedAfter: 0 }))
    const purchase = await buyTopUp(fake)
    const receipt = await service(fake).withdraw(null, {
      contractRef: purchase.contractRef.toLowerCase(), name: 'Jan', email: 'BUYER@shop.eu',
    })
    expect(Object.keys(receipt).sort()).toEqual(['content', 'declarationId', 'mailed', 'receivedAt'])
    expect(fake.state.refunds).toHaveLength(1)
    expect(fake.stores['payment-consumer-declaration'].rows[0]).toEqual(expect.objectContaining({ channel: 'public', matched: true }))
  })

  test('a wrong e-mail matches nothing: the same answer, recorded, a receipt that says what happens on a match', async () => {
    const fake = await withMeter(fixedMeter({ granted: 1_000, used: 0, usedAfter: 0 }))
    const purchase = await buyTopUp(fake)
    const receipt = await service(fake).withdraw(null, { contractRef: purchase.contractRef, name: 'Eve', email: 'eve@else.eu', language: 'en' })
    expect(Object.keys(receipt).sort()).toEqual(['content', 'declarationId', 'mailed', 'receivedAt'])
    expect(receipt.content).toEqual({ name: 'Eve', contract: purchase.contractRef, email: 'eve@else.eu' })
    expect(fake.state.refunds).toHaveLength(0)
    expect(fake.stores['payment-consumer-declaration'].rows[0]).toEqual(expect.objectContaining({ matched: false, status: 'received' }))
    expect(fake.mails.find(item => item.to === 'eve@else.eu')?.text).toContain('If these details match one of our contracts')
  })

  test('an invoice number and the paygate customer e-mail match too; a reserved domain is never mailed', async () => {
    const fake = await withMeter(fixedMeter({ granted: 1_000, used: 0, usedAfter: 0 }))
    await paygateCustomers(fake.ctx).create({ paygate: 'stripe', externalId: 'cus_1', entityId: ENTITY, email: 'billing@buyer.test' })
    await buyTopUp(fake)
    const receipt = await service(fake).withdraw(null, { contractRef: 'INV-0001', name: 'Jan', email: 'billing@buyer.test' })
    expect(receipt.mailed).toBe(false)
    expect(fake.state.refunds).toHaveLength(1)
    const skipped = (await consumerEvents(fake.ctx).list({ action: 'mail', recordId: receipt.declarationId })).items[0]
    expect(skipped).toEqual(expect.objectContaining({ ok: true, skipped: true }))
    expect(fake.mails.some(item => item.to.endsWith('.test'))).toBe(false)
  })
})

describe('consumer rights — cancellation', () => {
  const active = async (fake: FakeContext, overrides: Parameters<typeof subscriptionOf>[0] = {}) => {
    const subscription = subscriptionOf({ id: 'sub_c', periodEnd: new Date('2026-10-31T10:00:00.000Z'), ...overrides })
    fake.state.subscriptions.sub_c = subscription as never
    await send(fake, 'customer.subscription.updated', subscription)
  }
  const body = { kind: CancellationKind.Ordinary, name: 'Anna', email: 'owner@shop.eu', effective: 'earliest' as const }

  test('ordinary, at the earliest date: scheduled at the period end', async () => {
    const fake = await makeRightsContext()
    await active(fake)
    const receipt = await service(fake).cancel(subject, body)
    expect(receipt).toEqual(expect.objectContaining({ status: CancellationStatus.Scheduled, effectiveAt: new Date('2026-10-31T10:00:00.000Z') }))
    expect(fake.state.subscriptionChanges).toEqual([expect.objectContaining({
      id: 'sub_c', method: 'update', cancel_at_period_end: true, cancellation_details: { comment: `cancellation:${receipt.declarationId}` },
    })])
    expect(fake.observed.cancellation).toEqual([expect.objectContaining({ matched: true, status: 'scheduled', subscriptionId: 'sub_c' })])
    expect(fake.mails.find(item => item.to === 'owner@shop.eu')?.subject).toContain('cancellation')
  })

  test('a later requested date ends at the first period boundary on or after it, without proration', async () => {
    const fake = await makeRightsContext()
    await active(fake)
    const receipt = await service(fake).cancel(subject, { ...body, effective: 'date', date: '2026-12-10' })
    expect(receipt.effectiveAt).toEqual(new Date('2026-12-31T10:00:00.000Z'))
    expect(fake.state.subscriptionChanges[0]).toEqual(expect.objectContaining({
      cancel_at: Math.floor(new Date('2026-12-31T10:00:00.000Z').getTime() / 1000), proration_behavior: 'none',
    }))
  })

  test('already scheduled: nothing to change; extraordinary: recorded for an operator, the paygate untouched', async () => {
    const fake = await makeRightsContext()
    await active(fake, { cancelAtPeriodEnd: true })
    expect((await service(fake).cancel(subject, body)).status).toBe(CancellationStatus.AlreadyScheduled)
    const extraordinary = await service(fake).cancel(subject, { ...body, kind: CancellationKind.Extraordinary, reason: 'Service unusable', language: 'en' })
    expect(extraordinary.status).toBe(CancellationStatus.Review)
    expect(fake.state.subscriptionChanges).toHaveLength(0)
    const mail = fake.mails.filter(item => item.to === 'owner@shop.eu').at(-1)
    expect(mail?.text).toContain('We examine the reason you gave')
  })

  test('public by e-mail alone: the one organization with that paygate e-mail; the answer never says so', async () => {
    const fake = await makeRightsContext()
    await paygateCustomers(fake.ctx).create({ paygate: 'stripe', externalId: 'cus_1', entityId: ENTITY, email: 'Owner@Shop.eu' })
    await active(fake)
    const receipt = await service(fake).cancel(null, { ...body, email: 'owner@shop.eu' })
    expect(Object.keys(receipt).sort()).toEqual(['content', 'declarationId', 'mailed', 'receivedAt'])
    expect(fake.state.subscriptionChanges).toHaveLength(1)

    const unmatched = await service(fake).cancel(null, { ...body, email: 'nobody@else.eu', language: 'en' })
    expect(Object.keys(unmatched).sort()).toEqual(['content', 'declarationId', 'mailed', 'receivedAt'])
    expect(fake.state.subscriptionChanges).toHaveLength(1)
    expect(fake.mails.find(item => item.to === 'nobody@else.eu')?.text).toContain('If these details match one of our contracts')
  })

  test('in-app without a subscription: CancellationUnavailable', async () => {
    const fake = await makeRightsContext()
    const refusal = await service(fake).cancel(subject, body).catch(error => error)
    expect(refusal).toBeInstanceOf(CancellationUnavailable)
    expect(refusal.reason).toBe('no-subscription')
  })
})

describe('consumer rights — records', () => {
  test('a manual relock is audited; a mismatch is never a relock', async () => {
    const fake = await makeRightsContext()
    await buyTopUp(fake)
    const relocked = await service(fake).lock(ENTITY, 'DE', 'manual', { force: true, by: 'operator', reason: 'moved' })
    expect(relocked).toEqual(expect.objectContaining({ country: 'DE', locked: true, language: 'de', currency: 'eur' }))
    const relock = (await consumerEvents(fake.ctx).list({ action: 'relock' })).items[0]
    expect(JSON.parse(relock.detail ?? '{}')).toEqual({ from: 'PL', to: 'DE', currency: 'eur', by: 'operator', reason: 'moved' })
    expect((await service(fake).lock(ENTITY, 'FR', 'checkout')).country).toBe('DE')
  })

  test('an operator unlock deletes the profile, keeps it on an unlock event, and the next purchase locks again', async () => {
    const fake = await makeRightsContext()
    await buyTopUp(fake)
    const unlocked = await service(fake).unlock(ENTITY, { by: 'operator', reason: 'moved to Germany' })
    expect(unlocked).toEqual(expect.objectContaining({ country: 'PL', locked: true }))
    expect(await service(fake).profile(ENTITY)).toBeNull()
    const [event] = (await consumerEvents(fake.ctx).list({ action: 'unlock' })).items
    expect(event).toEqual(expect.objectContaining({ recordId: ENTITY, recordKind: 'profile', entityId: ENTITY, ok: true }))
    expect(JSON.parse(event.detail ?? '{}')).toEqual(expect.objectContaining({
      from: 'PL', by: 'operator', reason: 'moved to Germany',
      profile: expect.objectContaining({ entityId: ENTITY, country: 'PL', source: 'checkout', currency: 'eur' }),
    }))
    expect(await service(fake).unlock(ENTITY)).toBeNull()
    expect(await consumerEvents(fake.ctx).count({ action: 'unlock' })).toBe(1)

    await buyTopUp(fake, { id: 'cs_de', invoice: 'in_de', customer_details: { address: { country: 'DE' }, email: 'buyer@shop.eu' } })
    expect(await service(fake).profile(ENTITY)).toEqual(expect.objectContaining({ country: 'DE', locked: true }))
  })

  test('an unlocked organization is not locked again from its paygate customer — at checkout or in reconcile', async () => {
    const fake = await makeRightsContext()
    await buyTopUp(fake)
    await paygateCustomers(fake.ctx).create({ paygate: 'stripe', externalId: 'cus_saved', entityId: ENTITY, country: 'PL' })
    fake.state.customers.cus_saved = { id: 'cus_saved', object: 'customer', address: { country: 'PL' } }
    await service(fake).unlock(ENTITY, { by: 'operator', reason: 'wrong country' })

    const { createCheckoutLink } = await import('../src/plugins/stripe.js')
    await createCheckoutLink(fake.ctx, fake.stripe, {
      productSku: 'app-credits', entityId: ENTITY, service: 'app', amountMinor: 1_000, successUrl: 'https://app.example.com/ok', country: 'DE',
    })
    expect(await service(fake).profile(ENTITY)).toBeNull()
    expect(fake.state.checkoutSessions.at(-1)?.metadata).toEqual(expect.objectContaining({ country: 'DE' }))
    expect((await service(fake).reconcile()).locked).toBe(0)
    expect(await service(fake).profile(ENTITY)).toBeNull()
  })

  test('purchases list their windows; an unmanaged service reads and asserts but never withdraws', async () => {
    const fake = await makeRightsContext({ consumerRights: rightsOf() })
    const purchase = await buyTopUp(fake)
    expect(await service(fake).purchases(ENTITY, { open: true })).toEqual([expect.objectContaining({
      purchaseId: purchase.purchaseId, withdrawable: true, contractRef: purchase.contractRef,
    })])
    const { makeConsumerRightsService } = await import('../src/consumer/service.js')
    const readOnly = makeConsumerRightsService('read-only-rights', { manage: false })
    fake.ctx.registerService(readOnly)
    await expect(readOnly.assertConsent(ENTITY)).rejects.toBeInstanceOf(PerformanceConsentRequired)
    await expect(readOnly.withdraw(subject, { purchaseId: purchase.purchaseId, name: 'A', email: 'a@shop.eu' }))
      .rejects.toThrow('unmanaged')
    expect(await consumerDeclarations(fake.ctx).count({})).toBe(0)
  })
})

describe('consumer rights — registration order', () => {
  const meter = fixedMeter({ granted: 1_000 })

  for (const gatewayFirst of [false, true]) {
    const order = gatewayFirst ? 'after the gateway' : 'before the gateway'

    test(`appendConsumerRights ${order}: the meter and the paygate client are installed, its manage wins`, async () => {
      const fake = await makeRightsContext({ gatewayFirst, meter })
      expect(service(fake).usageMeter()).toBe(meter)
      expect(service(fake).managed).toBe(true)
      const purchase = await buyTopUp(fake)
      const receipt = await service(fake).withdraw(subject, { purchaseId: purchase.purchaseId, name: 'Anna', email: 'owner@shop.eu' })
      expect(receipt.status).toBe(WithdrawalStatus.Refunded)
      expect(fake.state.refunds).toHaveLength(1)
    })

    test(`appendConsumerRights ${order} without manage: the gateway's manage applies`, async () => {
      const fake = await makeRightsContext({ gatewayFirst, rights: () => ({ usage: meter }) })
      expect(service(fake).managed).toBe(false)
      expect(service(fake).usageMeter()).toBe(meter)
    })
  }

  test('the service is reachable while the application is wired, before the context initializes', async () => {
    const renderer = () => undefined
    const fake = await makeRightsContext({
      gatewayFirst: true,
      wire: ctx => { consumerRights(ctx).useMailRenderer(renderer) },
    })
    expect(service(fake).mailRenderer()).toBe(renderer)
  })
})
