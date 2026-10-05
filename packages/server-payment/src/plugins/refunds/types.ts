import type Stripe from 'stripe'
import type { PaymentFulfillmentRecord, PaymentSubscriptionRecord } from '../../types.js'

/** What a refund or a dispute is about: a one-time fulfillment, or one invoice of a subscription. */
export type PaymentTarget =
  | { kind: 'fulfillment', record: PaymentFulfillmentRecord, charge: Stripe.Charge | null, paymentIntentId?: string }
  | {
    kind: 'subscription', record: PaymentSubscriptionRecord, charge: Stripe.Charge | null,
    paymentIntentId?: string, invoiceId: string,
  }

export interface PaymentReference {
  paymentIntentId?: string
  chargeId?: string
  invoiceId?: string
  /** The charge, when the event already carries it. */
  charge?: Stripe.Charge | null
}

/** What a refund or a dispute of a context is about. */
export interface PaymentTargetHelper {
  /** A charge by id, or `null` when the paygate has none. */
  retrieveCharge: (stripe: Stripe, chargeId: string) => Promise<Stripe.Charge | null>
  /**
   * Resolve a refund or a dispute to the record it is about: by payment intent to a fulfillment;
   * by charge to a fulfillment (stored charge, else the charge's payment intent — whose charge id is
   * then remembered), else the charge's invoice; by invoice to the subscription whose latest invoice
   * it is, else the invoice's subscription. `null` when nothing here paid for it.
   */
  resolvePaymentTarget: (stripe: Stripe, ref: PaymentReference) => Promise<PaymentTarget | null>
}
