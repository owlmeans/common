import type Stripe from 'stripe'
import type { PaymentSubscriptionRecord, PurchaseRecord } from '../../types.js'
import type { CapturedPurchase, InvoiceEvidence, SessionEvidence } from '../types.js'

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
  /**
   * The buyer and totals of a Checkout Session. `presentment_details` (Adaptive Pricing) is not typed
   * by the pinned SDK, hence the narrow accessor.
   */
  sessionEvidenceOf: (session: Stripe.Checkout.Session) => SessionEvidence
  /**
   * An invoice's evidence, best effort: an unreachable invoice is logged and yields nothing — the
   * withdrawal reads it again when it needs it. `invoice.payment_intent` is top-level on the pinned
   * API version.
   */
  invoiceEvidenceOf: (stripe: Stripe | null | undefined, invoiceId: string | undefined) => Promise<InvoiceEvidence>
  /**
   * A completed, paid ONE-TIME checkout as a purchase — the window and the contract registry. Runs
   * BEFORE the credits are granted: the billing country is locked first (first write wins; another
   * country is a `lock-mismatch` event), then the purchase row is written, then its confirmation is
   * mailed. `null` when no consumer-rights policy is declared.
   */
  capturePaymentPurchase: (
    stripe: Stripe | null, session: Stripe.Checkout.Session, extra?: CapturedPaymentExtra, opts?: { mail?: boolean },
  ) => Promise<CapturedPurchase | null>
  /**
   * A subscription's FIRST invoice as a purchase — called while the subscription is committed, BEFORE
   * the `created` observers grant anything, so the window exists before the bundle can be spent. The
   * buyer's country and totals are refined when the checkout completes. The start request (when the
   * metadata names one) is the purchase's consent: `servicesStartedAt` and `consentedAt`.
   */
  captureSubscriptionPurchase: (
    stripe: Stripe | null, subscription: Stripe.Subscription, row: PaymentSubscriptionRecord,
  ) => Promise<CapturedPurchase | null>
  /**
   * Refine a subscription purchase with its completed checkout: the buyer's own country (and so the
   * scope and deadline), e-mail, the charged totals, the terms acceptance and the session id; lock
   * the billing country; mail the confirmation once.
   */
  completeSubscriptionPurchase: (
    stripe: Stripe | null, session: Stripe.Checkout.Session, purchase: PurchaseRecord, opts?: { mail?: boolean },
  ) => Promise<PurchaseRecord>
}
