import { PaygateError } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { ConsumerDeclarationRecord, PaymentSubscriptionRecord } from '../types.js'
import type { Paygate } from '../paygate/types.js'
import { paymentUtils } from '../utils.js'
import { consumerRecordsOf } from './records.js'
import type { CancellationHelper } from './cancellation/types.js'

export const makeCancellationHelper = (ctx: ApiContext): CancellationHelper => {
  const scheduleCancellation = async (
    paygate: Paygate, declaration: ConsumerDeclarationRecord, row: PaymentSubscriptionRecord, attempt: number = 0,
  ): Promise<boolean> => {
    const id = declaration.id as string
    const effectiveAt = declaration.effectiveAt != null ? new Date(declaration.effectiveAt) : null
    const atPeriodEnd = effectiveAt == null || row.periodEnd == null
      || effectiveAt.getTime() === new Date(row.periodEnd).getTime()
    try {
      if (paygate.subscriptions == null) {
        throw new PaygateError(`capability:subscriptions:${paygate.id}`)
      }
      await paygate.subscriptions.scheduleCancel(row.externalId, atPeriodEnd
        ? { atPeriodEnd: true }
        : { atPeriodEnd: false, at: effectiveAt as Date },
      {
        idempotencyKey: attempt > 0 ? `cancellation:${id}:schedule:${attempt}` : `cancellation:${id}:schedule`,
        comment: `cancellation:${id}`,
      })
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
