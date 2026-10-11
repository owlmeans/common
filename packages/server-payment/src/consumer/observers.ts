import { CancellationKind, CancellationStatus, WithdrawalStatus } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { WithdrawalComputation, WithdrawalExecution } from './types.js'
import type {
  CancellationEvent, ConsentEvent, ConsumerConsentRecord, ConsumerDeclarationRecord, PurchaseRecord,
} from '../types.js'
import { log } from '../log.js'
import { paymentAccessOf } from '../access.js'
import { paymentUtils } from '../utils.js'
import { consumerRecordsOf } from './records.js'
import { makePurchaseModel } from '../models/purchase.js'
import type { ConsumerObserversHelper } from './observers/types.js'

export const makeConsumerObserversHelper = (ctx: ApiContext): ConsumerObserversHelper => {
  const access = paymentAccessOf(ctx)
  const records = consumerRecordsOf(ctx)

  const runConsumerObservers = async (
    family: 'consent' | 'withdrawal' | 'cancellation', recordId: string, entityId: string | undefined,
    run: () => Promise<void>,
  ): Promise<boolean> => {
    const recordKind = family === 'consent' ? 'consent' as const : 'declaration' as const
    try {
      await run()
      await records.recordEvent({ recordId, recordKind, entityId, action: 'observers', step: family, ok: true })

      return true
    } catch (error) {
      log.error('Consumer-rights observers failed; reconcile retries them', { family, recordId, error })
      await records.recordEvent({
        recordId, recordKind, entityId, action: 'observers', step: family, ok: false, error: paymentUtils.errorText(error),
      })

      return false
    }
  }

  const notifyWithdrawal = async (
    declaration: ConsumerDeclarationRecord, purchase: PurchaseRecord, status: WithdrawalStatus,
    computation: Pick<WithdrawalComputation, 'reading' | 'deducted' | 'unitsReturned' | 'netMinor' | 'refundMinor'> | null,
    execution: WithdrawalExecution | null,
  ): Promise<boolean> => await runConsumerObservers('withdrawal', declaration.id as string, purchase.entityId, async () => {
    await access.observer().propagateWithdrawal({
      withdrawalId: declaration.id as string,
      eventKey: `withdrawal:${declaration.id as string}`,
      entityId: purchase.entityId,
      channel: declaration.channel,
      purchase: makePurchaseModel(purchase).ref(),
      declaredAt: new Date(declaration.receivedAt),
      status,
      refund: paymentUtils.compact({
        amountMinor: execution?.refundedMinor ?? 0,
        currency: purchase.currency,
        netMinor: computation?.netMinor,
        refundId: execution?.refundId,
        creditNoteId: execution?.creditNoteId,
      }) as { amountMinor: number, currency: string },
      units: computation != null
        ? { granted: computation.reading.granted, used: computation.deducted, returned: computation.unitsReturned } : null,
      subscriptionCanceled: execution?.subscriptionCanceled === true,
    }, ctx)
  })

  const notifyCancellation = async (
    declaration: ConsumerDeclarationRecord, status: CancellationStatus,
  ): Promise<boolean> => await runConsumerObservers('cancellation', declaration.id as string, declaration.entityId ?? undefined, async () => {
    await access.observer().propagateCancellation(paymentUtils.compact({
      cancellationId: declaration.id as string,
      eventKey: `cancellation:${declaration.id as string}`,
      entityId: declaration.entityId ?? undefined,
      matched: declaration.matched,
      channel: declaration.channel,
      kind: declaration.cancellationKind ?? CancellationKind.Ordinary,
      status,
      subscriptionId: declaration.subscriptionId ?? undefined,
      effectiveAt: declaration.effectiveAt != null ? new Date(declaration.effectiveAt) : undefined,
      declaredAt: new Date(declaration.receivedAt),
    }) as CancellationEvent, ctx)
  })

  const notifyConsent = async (consent: ConsumerConsentRecord): Promise<boolean> =>
    await runConsumerObservers('consent', consent.id as string, consent.entityId, async () => {
      await access.observer().propagateConsent(paymentUtils.compact({
        kind: consent.kind, consentId: consent.id as string, entityId: consent.entityId, profileId: consent.profileId,
        purchaseIds: [...consent.purchaseIds], planSku: consent.planSku, textVersion: consent.textVersion,
        language: consent.language, decidedAt: new Date(consent.decidedAt),
        expiresAt: consent.expiresAt != null ? new Date(consent.expiresAt) : undefined,
        eventKey: `consent:${consent.id as string}`,
      }) as ConsentEvent, ctx)
    })

  return { runConsumerObservers, notifyWithdrawal, notifyCancellation, notifyConsent }
}

/** The consumer-rights observers of a context — one per context. */
export const consumerObserversOf = memoHelper.oncePer(makeConsumerObserversHelper)
