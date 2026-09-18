import type Stripe from 'stripe'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { STRIPE_PAYGATE_ALIAS } from '../consts.js'
import { fulfillments, idOf, isMissingObject, subscriptions } from '../utils.js'
import type { PaymentFulfillmentRecord, PaymentSubscriptionRecord } from '../types.js'

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

/** A charge by id, or `null` when the paygate has none. */
export const retrieveCharge = async (stripe: Stripe, chargeId: string): Promise<Stripe.Charge | null> => {
  try {
    return await stripe.charges.retrieve(chargeId)
  } catch (error) {
    if (isMissingObject(error)) {
      return null
    }
    throw error
  }
}

const subscriptionOfInvoice = async (
  ctx: ApiContext, stripe: Stripe, invoiceId: string,
): Promise<PaymentSubscriptionRecord | null> => {
  const latest = await subscriptions(ctx).load({ paygate: STRIPE_PAYGATE_ALIAS, latestInvoiceId: invoiceId })
  if (latest != null) {
    return latest
  }
  let invoice: Stripe.Invoice
  try {
    invoice = await stripe.invoices.retrieve(invoiceId)
  } catch (error) {
    if (isMissingObject(error)) {
      return null
    }
    throw error
  }
  // `invoice.subscription` is top-level on the API version the client is pinned to.
  const subscriptionId = idOf((invoice as unknown as { subscription?: string | { id?: string } | null }).subscription)

  return subscriptionId != null
    ? await subscriptions(ctx).byExternalId(subscriptionId, STRIPE_PAYGATE_ALIAS)
    : null
}

/**
 * Resolve a refund or a dispute to the record it is about: by payment intent to a fulfillment;
 * by charge to a fulfillment (stored charge, else the charge's payment intent — whose charge id is
 * then remembered), else the charge's invoice; by invoice to the subscription whose latest invoice
 * it is, else the invoice's subscription. `null` when nothing here paid for it.
 */
export const resolvePaymentTarget = async (
  ctx: ApiContext, stripe: Stripe, ref: PaymentReference,
): Promise<PaymentTarget | null> => {
  const ledger = fulfillments(ctx)
  let charge = ref.charge ?? null
  let paymentIntentId = ref.paymentIntentId
  const chargeId = ref.chargeId ?? charge?.id

  if (paymentIntentId != null) {
    const record = await ledger.load({ paygate: STRIPE_PAYGATE_ALIAS, paymentIntentId })
    if (record != null) {
      return { kind: 'fulfillment', record, charge, paymentIntentId }
    }
  }

  let invoiceId = ref.invoiceId
  if (chargeId != null) {
    const record = await ledger.load({ paygate: STRIPE_PAYGATE_ALIAS, chargeId })
    if (record != null) {
      return { kind: 'fulfillment', record, charge, paymentIntentId: paymentIntentId ?? record.paymentIntentId }
    }
    charge = charge ?? await retrieveCharge(stripe, chargeId)
    const chargeIntent = idOf(charge?.payment_intent)
    if (chargeIntent != null && chargeIntent !== paymentIntentId) {
      paymentIntentId = chargeIntent
      const byIntent = await ledger.load({ paygate: STRIPE_PAYGATE_ALIAS, paymentIntentId: chargeIntent })
      if (byIntent != null) {
        const record = byIntent.chargeId == null ? await ledger.update({ ...byIntent, chargeId }) : byIntent
        return { kind: 'fulfillment', record, charge, paymentIntentId: chargeIntent }
      }
    }
    // `charge.invoice` is top-level on the API version the client is pinned to.
    invoiceId = invoiceId ?? idOf((charge as unknown as { invoice?: string | { id?: string } | null } | null)?.invoice)
  }

  if (invoiceId != null) {
    const record = await subscriptionOfInvoice(ctx, stripe, invoiceId)
    if (record != null) {
      return { kind: 'subscription', record, charge, paymentIntentId, invoiceId }
    }
  }

  return null
}
