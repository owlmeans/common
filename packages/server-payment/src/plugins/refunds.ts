import type Stripe from 'stripe'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import { STRIPE_PAYGATE_ALIAS } from '../consts.js'
import type { PaymentSubscriptionRecord } from '../types.js'
import type { PaymentReference, PaymentTarget, PaymentTargetHelper } from './refunds/types.js'
import { paymentAccessOf } from '../access.js'
import { paymentUtils } from '../utils.js'

export const makePaymentTargetHelper = (ctx: ApiContext): PaymentTargetHelper => {
  const access = paymentAccessOf(ctx)

  const retrieveCharge = async (stripe: Stripe, chargeId: string): Promise<Stripe.Charge | null> => {
    try {
      return await stripe.charges.retrieve(chargeId)
    } catch (error) {
      if (paymentUtils.isMissingObject(error)) {
        return null
      }
      throw error
    }
  }

  const subscriptionOfInvoice = async (
    stripe: Stripe, invoiceId: string,
  ): Promise<PaymentSubscriptionRecord | null> => {
    const latest = await access.subscriptions().load({ paygate: STRIPE_PAYGATE_ALIAS, latestInvoiceId: invoiceId })
    if (latest != null) {
      return latest
    }
    let invoice: Stripe.Invoice
    try {
      invoice = await stripe.invoices.retrieve(invoiceId)
    } catch (error) {
      if (paymentUtils.isMissingObject(error)) {
        return null
      }
      throw error
    }
    // `invoice.subscription` is top-level on the API version the client is pinned to.
    const subscriptionId = paymentUtils.idOf((invoice as unknown as { subscription?: string | { id?: string } | null }).subscription)

    return subscriptionId != null
      ? await access.subscriptions().byExternalId(subscriptionId, STRIPE_PAYGATE_ALIAS)
      : null
  }

  const resolvePaymentTarget = async (stripe: Stripe, ref: PaymentReference): Promise<PaymentTarget | null> => {
    const ledger = access.fulfillments()
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
      const chargeIntent = paymentUtils.idOf(charge?.payment_intent)
      if (chargeIntent != null && chargeIntent !== paymentIntentId) {
        paymentIntentId = chargeIntent
        const byIntent = await ledger.load({ paygate: STRIPE_PAYGATE_ALIAS, paymentIntentId: chargeIntent })
        if (byIntent != null) {
          const record = byIntent.chargeId == null ? await ledger.update({ ...byIntent, chargeId }) : byIntent
          return { kind: 'fulfillment', record, charge, paymentIntentId: chargeIntent }
        }
      }
      // `charge.invoice` is top-level on the API version the client is pinned to.
      invoiceId = invoiceId ?? paymentUtils.idOf((charge as unknown as { invoice?: string | { id?: string } | null } | null)?.invoice)
    }

    if (invoiceId != null) {
      const record = await subscriptionOfInvoice(stripe, invoiceId)
      if (record != null) {
        return { kind: 'subscription', record, charge, paymentIntentId, invoiceId }
      }
    }

    return null
  }

  return { retrieveCharge, resolvePaymentTarget }
}

/** The refund and dispute targets of a context — one per context. */
export const paymentTargetOf = memoHelper.oncePer(makePaymentTargetHelper)
