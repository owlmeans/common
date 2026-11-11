import type { PaymentFulfillmentRecord, PaymentSubscriptionRecord } from '../../types.js'
import type { Paygate, PaygateCharge } from '../../paygate/types.js'

/** What a refund or a dispute is about: a one-time fulfillment, or one invoice of a subscription. */
export type PaymentTarget =
  | { kind: 'fulfillment', record: PaymentFulfillmentRecord, charge: PaygateCharge | null, paymentIntentId?: string }
  | {
    kind: 'subscription', record: PaymentSubscriptionRecord, charge: PaygateCharge | null,
    paymentIntentId?: string, invoiceId: string,
  }

export interface PaymentReference {
  paymentIntentId?: string
  chargeId?: string
  invoiceId?: string
  /** The charge, when the event already carries it. */
  charge?: PaygateCharge | null
}

/** What a refund or a dispute of a context is about. */
export interface PaymentTargetHelper {
  /** A charge by id, or `null` when the paygate has none (or reads no payments). */
  retrieveCharge: (paygate: Paygate, chargeId: string) => Promise<PaygateCharge | null>
  /**
   * Resolve a refund or a dispute to the record it is about: by payment to a fulfillment; by charge
   * to a fulfillment (stored charge, else the charge's payment — whose charge id is then remembered),
   * else the charge's invoice; by invoice to the subscription whose latest invoice it is, else the
   * invoice's subscription. `null` when nothing here paid for it.
   */
  resolvePaymentTarget: (paygate: Paygate, ref: PaymentReference) => Promise<PaymentTarget | null>
}
