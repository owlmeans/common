import {
  CancellationStatus, ConsumerRegion, PurchaseKind, TaxBehavior, TaxEstimateStatus, TaxType, WithdrawalStatus,
} from '@owlmeans/payment'
import type {
  AmountCheckoutPolicy, CheckoutLimitView, ConsumerRightsLinks, PerformanceConsentView, PriceEstimate,
  SubscriptionStartView, WithdrawalCandidateList,
} from '@owlmeans/payment'

/** Canned consumer-rights data for the Playwright harness — no server, no Stripe. */

export const TRADER = 'Example Trader'

/** Links per language — a toggle switches them with the text. */
export const LINKS: Record<string, ConsumerRightsLinks> = Object.fromEntries(['en', 'de', 'fr', 'pl', 'es'].map(lng => {
  const prefix = lng === 'en' ? '' : `/${lng}`
  return [lng, {
    billingTerms: `https://example.test${prefix}/legal/billing-terms`,
    withdrawalInformation: `https://example.test${prefix}/legal/withdrawal`,
    withdrawalFunction: `https://example.test${prefix}/legal/withdraw`,
  }]
}))

export const linksOf = (lng: string): ConsumerRightsLinks => LINKS[lng] ?? LINKS.en

export const consentView = (lng: string): PerformanceConsentView => ({
  required: true, region: ConsumerRegion.Eu, country: lng.toUpperCase(), language: lng, trader: TRADER,
  textVersion: 'terms-2026-09', copyVersion: '2026-09-23', links: linksOf(lng),
  purchases: [
    {
      purchaseId: 'pur_1', contractRef: 'CR-260923-AB12CD', kind: PurchaseKind.TopUp,
      purchasedAt: new Date('2026-09-23T10:00:00Z'), deadline: new Date('2026-10-09T00:00:00Z'),
      productSku: 'credits', amountTotalMinor: 1_256, currency: 'eur', withdrawable: true,
    },
    {
      purchaseId: 'pur_2', contractRef: 'CR-260926-EF34GH', kind: PurchaseKind.TopUp,
      purchasedAt: new Date('2026-09-26T09:30:00Z'), deadline: new Date('2026-10-14T00:00:00Z'),
      productSku: 'credits', amountTotalMinor: 2_460, currency: 'eur', withdrawable: true,
    },
  ],
  deadline: new Date('2026-10-14T00:00:00Z'),
  at: new Date('2026-09-27T12:00:00Z'),
})

export const startView = (lng: string): SubscriptionStartView => ({
  required: true, planSku: 'pro-monthly', language: lng, trader: TRADER, textVersion: 'terms-2026-09',
  copyVersion: '2026-09-23', links: linksOf(lng), region: ConsumerRegion.Eu,
})

/** What the account withdrawal list answers on the wire — dates as ISO strings. */
export const withdrawalList = (lng: string): WithdrawalCandidateList => JSON.parse(JSON.stringify({
  language: lng, links: linksOf(lng), name: 'Marie Curie', email: 'marie@example.test',
  candidates: [
    {
      purchaseId: 'pur_1', contractRef: 'CR-260923-AB12CD', kind: PurchaseKind.TopUp,
      purchasedAt: new Date('2026-09-23T10:00:00Z'), deadline: new Date('2026-10-09T00:00:00Z'),
      amountTotalMinor: 1_256, currency: 'eur', automatic: true,
      estimate: { refundMinor: 942, currency: 'eur', timeDeductionMinor: 0, unitsDeductionMinor: 314, unitsUsed: 125_000, unitsGranted: 500_000 },
    },
    {
      purchaseId: 'pur_3', contractRef: 'CR-260925-ZZ99YY', kind: PurchaseKind.Subscription,
      purchasedAt: new Date('2026-09-25T08:00:00Z'), deadline: new Date('2026-10-10T00:00:00Z'),
      amountTotalMinor: 2_460, currency: 'eur', automatic: true, estimate: null,
    },
  ],
})) as WithdrawalCandidateList

export const withdrawalReceipt = {
  declarationId: 'wd_7Kq2', receivedAt: '2026-09-27T14:05:09.000Z', content: { name: 'Marie Curie' }, mailed: true,
  status: WithdrawalStatus.Refunded, refundMinor: 942, currency: 'eur',
}

export const publicReceipt = {
  declarationId: 'wd_pub1', receivedAt: '2026-09-27T14:05:09.000Z', content: {}, mailed: true,
}

export const cancellationReceipt = {
  declarationId: 'cn_4Rt8', receivedAt: '2026-09-27T16:30:00.000Z', content: {}, mailed: true,
  status: CancellationStatus.Scheduled, effectiveAt: '2026-10-31T00:00:00.000Z',
}

export const POLICY: AmountCheckoutPolicy = {
  currency: 'usd', minimumMinor: 500, maximumMinor: 50_000, defaultMinor: 1_000,
  presetsMinor: [1_000, 2_000, 5_000, 10_000], fixedMinor: 0, rateBps: 200,
}

export const PER_PURCHASE_LIMIT: CheckoutLimitView = {
  productSku: 'credits', currency: 'usd', minimumMinor: 500, maximumMinor: 2_500, narrowed: true, blocked: false,
  reason: 'per-purchase', resetsAt: new Date('2026-10-01T09:00:00Z'),
}

export const BLOCKED_LIMIT: CheckoutLimitView = {
  productSku: 'credits', currency: 'usd', minimumMinor: 500, maximumMinor: 0, narrowed: true, blocked: true,
  reason: 'window', resetsAt: new Date('2026-09-30T12:00:00Z'), remainingMinor: 0,
}

/** An estimate for a LOCKED billing country: the requested country is ignored. */
export const lockedEstimate = (subtotalMinor: number): PriceEstimate => ({
  country: 'DE', source: 'profile', locked: true, region: ConsumerRegion.Eu, currency: 'usd',
  behavior: TaxBehavior.Exclusive,
  tax: {
    status: TaxEstimateStatus.Taxed, subtotalMinor, taxMinor: Math.round(subtotalMinor * 0.19),
    totalMinor: subtotalMinor + Math.round(subtotalMinor * 0.19), scalable: true,
    rates: [{ type: TaxType.Vat, percentage: '19', ratePpm: 190_000, country: 'DE' }],
  },
})
