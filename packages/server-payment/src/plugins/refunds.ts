import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { PaymentSubscriptionRecord } from '../types.js'
import type { Paygate, PaygateCharge } from '../paygate/types.js'
import type { PaymentReference, PaymentTarget, PaymentTargetHelper } from './refunds/types.js'
import { paymentAccessOf } from '../access.js'

export const makePaymentTargetHelper = (ctx: ApiContext): PaymentTargetHelper => {
  const access = paymentAccessOf(ctx)

  const retrieveCharge = async (paygate: Paygate, chargeId: string): Promise<PaygateCharge | null> =>
    paygate.payments != null ? await paygate.payments.charge(chargeId) : null

  const subscriptionOfInvoice = async (paygate: Paygate, invoiceId: string): Promise<PaymentSubscriptionRecord | null> => {
    const latest = await access.subscriptions().load({ paygate: paygate.id, latestInvoiceId: invoiceId })
    if (latest != null) {
      return latest
    }
    const invoice = paygate.payments != null ? await paygate.payments.invoice(invoiceId) : null
    const subscriptionId = invoice?.subscriptionId

    return subscriptionId != null ? await access.subscriptions().byExternalId(subscriptionId, paygate.id) : null
  }

  const resolvePaymentTarget = async (paygate: Paygate, ref: PaymentReference): Promise<PaymentTarget | null> => {
    const ledger = access.fulfillments()
    let charge = ref.charge ?? null
    let paymentIntentId = ref.paymentIntentId
    const chargeId = ref.chargeId ?? charge?.id

    if (paymentIntentId != null) {
      const record = await ledger.load({ paygate: paygate.id, paymentIntentId })
      if (record != null) {
        return { kind: 'fulfillment', record, charge, paymentIntentId }
      }
    }

    let invoiceId = ref.invoiceId
    if (chargeId != null) {
      const record = await ledger.load({ paygate: paygate.id, chargeId })
      if (record != null) {
        return { kind: 'fulfillment', record, charge, paymentIntentId: paymentIntentId ?? record.paymentIntentId }
      }
      charge = charge ?? await retrieveCharge(paygate, chargeId)
      const chargeIntent = charge?.paymentId
      if (chargeIntent != null && chargeIntent !== paymentIntentId) {
        paymentIntentId = chargeIntent
        const byIntent = await ledger.load({ paygate: paygate.id, paymentIntentId: chargeIntent })
        if (byIntent != null) {
          const record = byIntent.chargeId == null ? await ledger.update({ ...byIntent, chargeId }) : byIntent
          return { kind: 'fulfillment', record, charge, paymentIntentId: chargeIntent }
        }
      }
      invoiceId = invoiceId ?? charge?.invoiceId
    }

    if (invoiceId != null) {
      const record = await subscriptionOfInvoice(paygate, invoiceId)
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
