import type {
  AmountPolicyView, BillingProfileView, CancellationReceipt, CheckoutLimitView, DeclarationReceipt,
  PerformanceConsentResponse, PerformanceConsentView, PurchaseList, PurchaseView, SubscriptionStartResponse,
  WithdrawalCandidate, WithdrawalCandidateList, WithdrawalReceipt,
} from '../types.js'

// The wire carries every date as an ISO string (see `model/consumer.ts`). Each reviver copies the
// value and turns the named fields back into `Date`s; a value that already holds dates is copied
// as is, so reviving twice is harmless.

type Dated = Record<string, unknown>

const revive = <T>(value: T, fields: readonly string[]): T => {
  const copy: Dated = { ...(value as Dated) }
  for (const field of fields) {
    const raw = copy[field]
    if (raw != null && !(raw instanceof Date)) {
      copy[field] = new Date(raw as string)
    }
  }

  return copy as T
}

export const revivePurchase = (purchase: PurchaseView): PurchaseView =>
  revive(purchase, ['purchasedAt', 'deadline', 'consentedAt', 'withdrawnAt'])

export const revivePurchaseList = (list: PurchaseList): PurchaseList =>
  ({ ...list, purchases: list.purchases.map(revivePurchase) })

export const reviveBillingProfile = (profile: BillingProfileView): BillingProfileView =>
  revive(profile, ['lockedAt'])

export const reviveConsentView = (view: PerformanceConsentView): PerformanceConsentView => ({
  ...revive(view, ['deadline', 'at']),
  purchases: view.purchases.map(revivePurchase),
})

export const reviveConsentResponse = (response: PerformanceConsentResponse): PerformanceConsentResponse =>
  revive(response, ['consentedAt'])

export const reviveStartResponse = (response: SubscriptionStartResponse): SubscriptionStartResponse =>
  revive(response, ['requestedAt', 'expiresAt'])

const reviveCandidate = (candidate: WithdrawalCandidate): WithdrawalCandidate =>
  revive(candidate, ['purchasedAt', 'deadline'])

export const reviveWithdrawalList = (list: WithdrawalCandidateList): WithdrawalCandidateList =>
  ({ ...list, candidates: list.candidates.map(reviveCandidate) })

/** Any declaration receipt — withdrawal or cancellation. */
export const reviveReceipt = <T extends DeclarationReceipt | WithdrawalReceipt | CancellationReceipt>(receipt: T): T =>
  revive(receipt, ['receivedAt', 'effectiveAt'])

export const reviveCheckoutLimit = (limit: CheckoutLimitView): CheckoutLimitView =>
  revive(limit, ['resetsAt'])

export const reviveAmountPolicyView = (view: AmountPolicyView): AmountPolicyView =>
  ({ ...view, limit: view.limit == null ? null : reviveCheckoutLimit(view.limit) })
