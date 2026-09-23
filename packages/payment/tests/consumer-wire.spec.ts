import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import {
  BillingProfileViewSchema, CancellationBodySchema, CancellationReceiptSchema, ConsumerRegion,
  CreateCheckoutBodySchema, PerformanceConsentBodySchema, PerformanceConsentViewSchema, PlanPriceListSchema,
  PlanStatus, PlanDuration, PriceEstimateSchema, ProductPlanSchema, PurchaseKind, reviveConsentView, reviveReceipt,
  reviveWithdrawalList, SubscriptionStartViewSchema, TaxBehavior, TaxEstimateStatus, WithdrawalBodySchema,
  WithdrawalCandidateListSchema, WithdrawalStatus, WithdrawalReceiptSchema, CancellationKind, CancellationStatus,
} from '../src/index.js'
import type { PerformanceConsentView, PurchaseView, WithdrawalCandidateList } from '../src/index.js'

const ajv = new Ajv({ strict: false, validateFormats: false })
const wire = <T>(value: T): unknown => JSON.parse(JSON.stringify(value))

const links = { billingTerms: 'https://example.com/terms', withdrawalInformation: 'https://example.com/withdrawal' }
const purchase: PurchaseView = {
  purchaseId: 'stripe:cs_test_1', contractRef: 'CR-260923-ABC123', kind: PurchaseKind.TopUp,
  purchasedAt: new Date('2026-09-23T10:00:00.000Z'), deadline: new Date('2026-10-09T00:00:00.000Z'),
  productSku: 'credits-product', amountTotalMinor: 3075, currency: 'eur', withdrawable: true,
}

describe('consumer-rights wire shapes', () => {
  test('a consent view crosses as ISO strings and revives', () => {
    const view: PerformanceConsentView = {
      required: true, region: ConsumerRegion.Eu, country: 'PL', language: 'pl', trader: 'Trader Ltd',
      textVersion: '2026-09-23', copyVersion: '2026-09-23', links, purchases: [purchase],
      deadline: purchase.deadline, at: new Date('2026-09-24T08:00:00.000Z'),
    }
    const sent = wire(view) as PerformanceConsentView
    expect(ajv.validate(PerformanceConsentViewSchema, sent)).toBe(true)
    expect(typeof sent.at).toBe('string')
    const revived = reviveConsentView(sent)
    expect(revived.at).toEqual(view.at)
    expect(revived.purchases[0].purchasedAt).toEqual(purchase.purchasedAt)
    expect(revived.purchases[0].deadline).toEqual(purchase.deadline)
    expect(reviveConsentView(revived)).toEqual(revived)
  })

  test('a consent body must acknowledge', () => {
    const body = { purchaseIds: ['stripe:cs_test_1'], textVersion: '2026-09-23', language: 'de', acknowledged: true }
    expect(ajv.validate(PerformanceConsentBodySchema, body)).toBe(true)
    expect(ajv.validate(PerformanceConsentBodySchema, { ...body, acknowledged: false })).toBe(false)
    expect(ajv.validate(PerformanceConsentBodySchema, { ...body, uiLanguage: 'en' })).toBe(true)
    expect(ajv.validate(PerformanceConsentBodySchema, { ...body, language: 'German' })).toBe(false)
  })

  test('a withdrawal or cancellation asks only for name, contract and e-mail, plus a honeypot', () => {
    expect(ajv.validate(WithdrawalBodySchema, { contractRef: 'CR-260923-ABC123', name: 'Anna', email: 'anna@example.eu' })).toBe(true)
    expect(ajv.validate(WithdrawalBodySchema, { name: 'Anna', email: 'anna@example.eu', honeypot: '' })).toBe(true)
    expect(ajv.validate(WithdrawalBodySchema, { name: 'Anna', email: 'not-an-address' })).toBe(false)
    expect(ajv.validate(WithdrawalBodySchema, { name: 'Anna', email: 'anna@example.eu', address: 'x' })).toBe(false)
    const cancel = { kind: CancellationKind.Ordinary, name: 'Anna', effective: 'date', date: '2026-12-31', email: 'anna@example.eu' }
    expect(ajv.validate(CancellationBodySchema, cancel)).toBe(true)
    expect(ajv.validate(CancellationBodySchema, { ...cancel, date: '31.12.2026' })).toBe(false)
  })

  test('receipts and candidate lists revive their dates', () => {
    const receipt = {
      declarationId: 'decl-1', receivedAt: new Date('2026-09-25T09:30:00.000Z'), content: { name: 'Anna' }, mailed: true,
      status: WithdrawalStatus.Refunded, refundMinor: 3075, currency: 'eur',
    }
    expect(ajv.validate(WithdrawalReceiptSchema, wire(receipt))).toBe(true)
    expect(reviveReceipt(wire(receipt) as typeof receipt).receivedAt).toEqual(receipt.receivedAt)
    const cancellation = { ...receipt, status: CancellationStatus.Scheduled, effectiveAt: new Date('2026-10-31T00:00:00.000Z') }
    delete (cancellation as Partial<typeof cancellation>).refundMinor
    delete (cancellation as Partial<typeof cancellation>).currency
    expect(ajv.validate(CancellationReceiptSchema, wire(cancellation))).toBe(true)
    expect(reviveReceipt(wire(cancellation) as typeof cancellation).effectiveAt).toEqual(cancellation.effectiveAt)

    const list: WithdrawalCandidateList = {
      candidates: [{
        purchaseId: purchase.purchaseId, contractRef: purchase.contractRef, kind: purchase.kind,
        purchasedAt: purchase.purchasedAt, deadline: purchase.deadline!, amountTotalMinor: 3075, currency: 'eur',
        estimate: { refundMinor: 3075, currency: 'eur', timeDeductionMinor: 0, unitsDeductionMinor: 0 }, automatic: true,
      }],
      language: 'de', links,
    }
    expect(ajv.validate(WithdrawalCandidateListSchema, wire(list))).toBe(true)
    expect(reviveWithdrawalList(wire(list) as WithdrawalCandidateList).candidates[0].deadline).toEqual(purchase.deadline!)
  })

  test('profile, start view and plan prices', () => {
    expect(ajv.validate(BillingProfileViewSchema, {
      country: null, region: null, currency: null, locked: false, language: 'en', inScope: true,
    })).toBe(true)
    expect(ajv.validate(SubscriptionStartViewSchema, {
      required: true, planSku: 'pro-monthly', language: 'fr', trader: 'Trader Ltd', textVersion: 'v1',
      copyVersion: 'v1', links, region: ConsumerRegion.Eu,
    })).toBe(true)
    expect(ajv.validate(PlanPriceListSchema, { prices: [
      { planSku: 'pro-monthly', currency: 'eur', unitAmountMinor: 1709, default: true, taxBehavior: TaxBehavior.Exclusive, interval: 'month' },
      { planSku: 'pro-monthly', currency: 'usd', unitAmountMinor: 2000, default: false },
    ] })).toBe(true)
  })
})

describe('extended catalogue and checkout shapes', () => {
  test('a checkout body carries the declared country and the start request', () => {
    expect(ajv.validate(CreateCheckoutBodySchema, {
      productSku: 'pro-product', planSku: 'pro-monthly', entitySlug: 'acme', service: 'manager', country: 'PL',
      startRequestId: 'start-1',
    })).toBe(true)
    expect(ajv.validate(CreateCheckoutBodySchema, {
      productSku: 'pro-product', entitySlug: 'acme', service: 'manager', country: 'pl',
    })).toBe(false)
  })

  test('an estimate may come from the locked profile', () => {
    expect(ajv.validate(PriceEstimateSchema, {
      country: 'PL', source: 'profile', locked: true, region: ConsumerRegion.Eu, currency: 'eur',
      behavior: TaxBehavior.Exclusive,
      tax: { status: TaxEstimateStatus.Taxed, subtotalMinor: 100, taxMinor: 23, totalMinor: 123, scalable: true, rates: [] },
    })).toBe(true)
  })

  test('a plan declares its withdrawal components', () => {
    const plan = {
      productSku: 'pro-product', sku: 'pro-monthly', status: PlanStatus.Active, duration: PlanDuration.Monthly,
      price: 20, title: 'Pro',
      withdrawal: { components: [
        { key: 'services', basis: 'time', shareMinor: 1000 }, { key: 'credits', basis: 'units', shareMinor: 1000 },
      ] },
    }
    expect(ajv.validate(ProductPlanSchema, plan)).toBe(true)
    expect(ajv.validate(ProductPlanSchema, { ...plan, withdrawal: { components: [{ key: 'x', basis: 'days', shareMinor: 1 }] } })).toBe(false)
    expect(ajv.validate(ProductPlanSchema, { ...plan, withdrawal: { components: [] } })).toBe(false)
  })
})
