import type {
  AmountPolicyView, BillingProfileView, CancellationReceipt, CheckoutLimitView, DeclarationReceipt,
  PerformanceConsentResponse, PerformanceConsentView, PurchaseList, PurchaseView, SubscriptionStartResponse,
  WithdrawalCandidateList, WithdrawalReceipt,
} from '../../types.js'

/**
 * The consumer-rights wire values with their dates turned back into `Date`s. Each reviver copies
 * the value; a value that already holds dates is copied as is, so reviving twice is harmless.
 */
export interface ConsumerReviveHelper {
  revivePurchase: (purchase: PurchaseView) => PurchaseView
  revivePurchaseList: (list: PurchaseList) => PurchaseList
  reviveBillingProfile: (profile: BillingProfileView) => BillingProfileView
  reviveConsentView: (view: PerformanceConsentView) => PerformanceConsentView
  reviveConsentResponse: (response: PerformanceConsentResponse) => PerformanceConsentResponse
  reviveStartResponse: (response: SubscriptionStartResponse) => SubscriptionStartResponse
  reviveWithdrawalList: (list: WithdrawalCandidateList) => WithdrawalCandidateList
  /** Any declaration receipt — withdrawal or cancellation. */
  reviveReceipt: <T extends DeclarationReceipt | WithdrawalReceipt | CancellationReceipt>(receipt: T) => T
  reviveCheckoutLimit: (limit: CheckoutLimitView) => CheckoutLimitView
  reviveAmountPolicyView: (view: AmountPolicyView) => AmountPolicyView
}
