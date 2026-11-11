import type { PaymentSubscriptionRecord, PurchaseRecord } from '../../types.js'
import type { CapturedPurchase, InvoiceEvidence, SessionEvidence } from '../types.js'
import type { CheckoutSnapshot, Paygate, PaygateSubscription } from '../../paygate/types.js'

/** What a one-time checkout or a subscription's first invoice extra-records of its purchase. */
export interface CapturedPaymentExtra {
  netAmountMinor?: number
  amountCurrency?: string
  units?: number
  taxBehavior?: string
  at?: Date
}

/** Paid checkouts and first invoices of a context, captured as purchases. */
export interface CaptureHelper {
  /** The buyer and totals of a checkout session (the local-currency presentment, the terms acceptance). */
  sessionEvidenceOf: (session: CheckoutSnapshot) => SessionEvidence
  /**
   * An invoice's evidence, best effort: an unreachable invoice is logged and yields nothing — the
   * withdrawal reads it again when it needs it. A paygate without `payments` yields nothing.
   */
  invoiceEvidenceOf: (paygate: Paygate | null | undefined, invoiceId: string | undefined) => Promise<InvoiceEvidence>
  /**
   * A completed, paid ONE-TIME checkout as a purchase — the window and the contract registry. Runs
   * BEFORE the credits are granted: the billing country is locked first (first write wins; another
   * country is a `lock-mismatch` event), then the purchase row is written, then its confirmation is
   * mailed. `null` when no consumer-rights policy is declared.
   */
  capturePaymentPurchase: (
    paygate: Paygate, session: CheckoutSnapshot, extra?: CapturedPaymentExtra, opts?: { mail?: boolean },
  ) => Promise<CapturedPurchase | null>
  /**
   * A subscription's FIRST invoice as a purchase — called while the subscription is committed, BEFORE
   * the `created` observers grant anything, so the window exists before the bundle can be spent. The
   * buyer's country and totals are refined when the checkout completes. The start request (when the
   * metadata names one) is the purchase's consent: `servicesStartedAt` and `consentedAt`.
   */
  captureSubscriptionPurchase: (
    paygate: Paygate, subscription: PaygateSubscription, row: PaymentSubscriptionRecord,
  ) => Promise<CapturedPurchase | null>
  /**
   * Refine a subscription purchase with its completed checkout: the buyer's own country (and so the
   * scope and deadline), e-mail, the charged totals, the terms acceptance and the session id; lock
   * the billing country; mail the confirmation once.
   */
  completeSubscriptionPurchase: (
    paygate: Paygate, session: CheckoutSnapshot, purchase: PurchaseRecord, opts?: { mail?: boolean },
  ) => Promise<PurchaseRecord>
}
