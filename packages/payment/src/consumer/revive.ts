import type {
  AmountPolicyView, BillingProfileView, CancellationReceipt, CheckoutLimitView, DeclarationReceipt,
  PerformanceConsentResponse, PerformanceConsentView, PurchaseList, PurchaseView, SubscriptionStartResponse,
  WithdrawalCandidate, WithdrawalCandidateList, WithdrawalReceipt,
} from '../types.js'
import type { Dated } from './types.local.js'
import type { ConsumerReviveHelper } from './revive/types.js'

// The wire carries every date as an ISO string (see `model/consumer.ts`). Each reviver copies the
// value and turns the named fields back into `Date`s; a value that already holds dates is copied
// as is, so reviving twice is harmless.

export const createConsumerReviveHelper = (): ConsumerReviveHelper => {
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

  const revivePurchase = (purchase: PurchaseView): PurchaseView =>
    revive(purchase, ['purchasedAt', 'deadline', 'consentedAt', 'withdrawnAt'])

  const revivePurchaseList = (list: PurchaseList): PurchaseList =>
    ({ ...list, purchases: list.purchases.map(revivePurchase) })

  const reviveBillingProfile = (profile: BillingProfileView): BillingProfileView =>
    revive(profile, ['lockedAt'])

  const reviveConsentView = (view: PerformanceConsentView): PerformanceConsentView => ({
    ...revive(view, ['deadline', 'at']),
    purchases: view.purchases.map(revivePurchase),
  })

  const reviveConsentResponse = (response: PerformanceConsentResponse): PerformanceConsentResponse =>
    revive(response, ['consentedAt'])

  const reviveStartResponse = (response: SubscriptionStartResponse): SubscriptionStartResponse =>
    revive(response, ['requestedAt', 'expiresAt'])

  const reviveCandidate = (candidate: WithdrawalCandidate): WithdrawalCandidate =>
    revive(candidate, ['purchasedAt', 'deadline'])

  const reviveWithdrawalList = (list: WithdrawalCandidateList): WithdrawalCandidateList =>
    ({ ...list, candidates: list.candidates.map(reviveCandidate) })

  const reviveReceipt = <T extends DeclarationReceipt | WithdrawalReceipt | CancellationReceipt>(receipt: T): T =>
    revive(receipt, ['receivedAt', 'effectiveAt'])

  const reviveCheckoutLimit = (limit: CheckoutLimitView): CheckoutLimitView =>
    revive(limit, ['resetsAt'])

  const reviveAmountPolicyView = (view: AmountPolicyView): AmountPolicyView =>
    ({ ...view, limit: view.limit == null ? null : reviveCheckoutLimit(view.limit) })

  return {
    revivePurchase, revivePurchaseList, reviveBillingProfile, reviveConsentView, reviveConsentResponse,
    reviveStartResponse, reviveWithdrawalList, reviveReceipt, reviveCheckoutLimit, reviveAmountPolicyView,
  }
}

export const consumerReviveHelper = createConsumerReviveHelper()

/** @deprecated compat:factory-refactor — use `consumerReviveHelper.revivePurchaseList(…)` */
export const revivePurchaseList = (list: PurchaseList): PurchaseList => consumerReviveHelper.revivePurchaseList(list)

/** @deprecated compat:factory-refactor — use `consumerReviveHelper.reviveBillingProfile(…)` */
export const reviveBillingProfile = (profile: BillingProfileView): BillingProfileView =>
  consumerReviveHelper.reviveBillingProfile(profile)

/** @deprecated compat:factory-refactor — use `consumerReviveHelper.reviveConsentView(…)` */
export const reviveConsentView = (view: PerformanceConsentView): PerformanceConsentView =>
  consumerReviveHelper.reviveConsentView(view)

/** @deprecated compat:factory-refactor — use `consumerReviveHelper.reviveAmountPolicyView(…)` */
export const reviveAmountPolicyView = (view: AmountPolicyView): AmountPolicyView =>
  consumerReviveHelper.reviveAmountPolicyView(view)
