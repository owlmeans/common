import type Stripe from 'stripe'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { ConsumerDeclarationRecord, PaymentSubscriptionRecord } from '../types.js'
import { paymentUtils } from '../utils.js'
import { consumerRecordsOf } from './records.js'
import type { CancellationHelper } from './cancellation/types.js'

export const makeCancellationHelper = (ctx: ApiContext): CancellationHelper => {
  const scheduleCancellation = async (
    stripe: Stripe, declaration: ConsumerDeclarationRecord, row: PaymentSubscriptionRecord, attempt: number = 0,
  ): Promise<boolean> => {
    const id = declaration.id as string
    const effectiveAt = declaration.effectiveAt != null ? new Date(declaration.effectiveAt) : null
    const atPeriodEnd = effectiveAt == null || row.periodEnd == null
      || effectiveAt.getTime() === new Date(row.periodEnd).getTime()
    const details = { comment: `cancellation:${id}` }
    try {
      await stripe.subscriptions.update(row.externalId, atPeriodEnd
        ? { cancel_at_period_end: true, cancellation_details: details }
        : { cancel_at: Math.floor((effectiveAt as Date).getTime() / 1000), proration_behavior: 'none', cancellation_details: details },
      { idempotencyKey: attempt > 0 ? `cancellation:${id}:schedule:${attempt}` : `cancellation:${id}:schedule` })
      await consumerRecordsOf(ctx).recordEvent({
        recordId: id, recordKind: 'declaration', entityId: row.entityId, action: 'cancel-scheduled', ok: true,
        externalId: row.externalId, detail: JSON.stringify({ atPeriodEnd, effectiveAt: effectiveAt?.toISOString() }),
      })

      return true
    } catch (error) {
      await consumerRecordsOf(ctx).recordEvent({
        recordId: id, recordKind: 'declaration', entityId: row.entityId, action: 'cancel-scheduled', ok: false,
        externalId: row.externalId, error: paymentUtils.errorText(error),
      })

      return false
    }
  }

  return { scheduleCancellation }
}

/** The paygate cancellations of a context — one per context. */
export const cancellationOf = memoHelper.oncePer(makeCancellationHelper)
