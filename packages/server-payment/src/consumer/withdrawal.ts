import { PaygateError, PurchaseKind, type WithdrawalEstimate, consumerCopyHelper, withdrawalRefundHelper } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { ConsumerDeclarationRecord, PaymentSubscriptionRecord, PurchaseRecord, UsageMeter } from '../types.js'
import { DAY_MS } from './consts.local.js'
import type { WithdrawalComputation, WithdrawalExecution } from './types.js'
import type { CreditNoteLine, Paygate, PaygateCall, PaygateCreditNote, PaygateRefund } from '../paygate/types.js'
import { paymentAccessOf } from '../access.js'
import { paymentUtils } from '../utils.js'
import { catalogueOf } from '../catalogue.js'
import { consumerFormatHelper } from './format.js'
import { consumerRecordsOf } from './records.js'
import { makePurchaseModel } from '../models/purchase.js'
import type { ConsumerEventDraft } from './records/types.js'
import { captureOf } from './capture.js'
import type { WithdrawalHelper } from './withdrawal/types.js'

/**
 * A paygate may replay the stored answer of an idempotency key — a failure too: a retry uses a fresh
 * key (`…:<attempt>`) and first adopts what an earlier attempt may have made.
 */
const keyOf = (withdrawalId: string, step: string, attempt: number): string =>
  attempt > 0 ? `withdrawal:${withdrawalId}:${step}:${attempt}` : `withdrawal:${withdrawalId}:${step}`

export const makeWithdrawalHelper = (ctx: ApiContext): WithdrawalHelper => {
  const access = paymentAccessOf(ctx)
  const records = consumerRecordsOf(ctx)
  const capture = captureOf(ctx)

  const computeWithdrawal = async (
    meter: UsageMeter, purchase: PurchaseRecord, at: Date,
  ): Promise<WithdrawalComputation> => {
    const reading = await meter.used(ctx, paymentUtils.compact({
      entityId: purchase.entityId, purchase: makePurchaseModel(purchase).ref(),
      after: purchase.consentedAt != null ? new Date(purchase.consentedAt) : undefined, at,
    }))
    const deducted = Math.max(0, reading.usedAfter) + Math.max(0, reading.settled ?? 0) + Math.max(0, reading.clawed ?? 0)
    const unitsReturned = Math.max(0, Math.floor(reading.remaining
      ?? reading.granted - reading.used - (reading.settled ?? 0) - (reading.clawed ?? 0)))
    const paid = purchase.amountTotalMinor
    const refunded = purchase.refundedMinor ?? 0
    const net = purchase.amountSubtotalMinor
    // The earlier refunds' net share, so the credit note never credits more than is left.
    const refundedNet = paid > 0 ? Math.floor(refunded * net / paid) : 0

    if (purchase.kind === PurchaseKind.TopUp) {
      const gross = withdrawalRefundHelper.oneTimeWithdrawalRefund({ paidMinor: paid, refundedMinor: refunded, unitsGranted: reading.granted, unitsUsed: deducted })
      const netRefund = withdrawalRefundHelper.oneTimeWithdrawalRefund({ paidMinor: net, refundedMinor: refundedNet, unitsGranted: reading.granted, unitsUsed: deducted })
      const open = Math.max(0, paid - refunded)

      return {
        reading, deducted, unitsReturned,
        refundMinor: gross.refundMinor,
        netMinor: netRefund.refundMinor,
        estimate: {
          refundMinor: gross.refundMinor, currency: purchase.currency, timeDeductionMinor: 0,
          unitsDeductionMinor: Math.max(0, open - gross.refundMinor),
          unitsUsed: Math.min(deducted, reading.granted), unitsGranted: reading.granted,
        },
      }
    }

    const subscription = purchase.subscriptionId != null
      ? await access.subscriptions().byExternalId(purchase.subscriptionId, purchase.paygate) : null
    const plan = purchase.planSku != null ? await catalogueOf(ctx).findPlan(purchase.planSku) : null
    const purchasedAt = new Date(purchase.purchasedAt)
    const periodStart = subscription?.periodStart != null ? new Date(subscription.periodStart) : purchasedAt
    const periodEnd = subscription?.periodEnd != null ? new Date(subscription.periodEnd)
      : new Date(periodStart.getTime() + (plan?.recurring?.interval === 'year' ? 365 : 30) * DAY_MS)
    const result = withdrawalRefundHelper.subscriptionWithdrawalRefund({
      paidMinor: paid, refundedMinor: refunded, netMinor: net,
      components: plan?.withdrawal?.components,
      periodStart, periodEnd,
      servicesRequestedAt: purchase.servicesStartedAt != null ? new Date(purchase.servicesStartedAt) : null,
      withdrawnAt: at,
      units: { granted: reading.granted, used: deducted },
    })

    return {
      reading, deducted, unitsReturned,
      refundMinor: result.refundMinor,
      netMinor: result.refundNetMinor,
      estimate: paymentUtils.compact({
        refundMinor: result.refundMinor, currency: purchase.currency, timeDeductionMinor: result.timeDeductionMinor,
        unitsDeductionMinor: result.unitsDeductionMinor, elapsedDays: result.elapsedDays, periodDays: result.periodDays,
        unitsUsed: result.unitsUsed, unitsGranted: result.unitsGranted,
      }) as WithdrawalEstimate,
    }
  }

  const memoOf = (declaration: ConsumerDeclarationRecord, purchase: PurchaseRecord): string =>
    consumerCopyHelper.consumerText(declaration.language, 'credit-note.memo', {
      contractRef: purchase.contractRef, date: consumerFormatHelper.formatDate(new Date(declaration.receivedAt), declaration.language),
    })

  const executeWithdrawal = async (
    paygate: Paygate, declaration: ConsumerDeclarationRecord, purchase: PurchaseRecord,
    computation: { refundMinor: number, netMinor: number }, opts: { attempt?: number } = {},
  ): Promise<WithdrawalExecution> => {
    const withdrawalId = declaration.id as string
    const attempt = opts.attempt ?? 0
    const call = (step: string, comment?: string): PaygateCall => ({
      idempotencyKey: keyOf(withdrawalId, step, attempt), ...(comment != null ? { comment } : {}),
    })
    const event = (action: 'refund' | 'credit-note' | 'subscription-cancel', fields: Record<string, unknown>) =>
      records.recordEvent({
        recordId: withdrawalId, recordKind: 'declaration', entityId: purchase.entityId, action, ok: false, ...fields,
      } as ConsumerEventDraft)
    const outcome: WithdrawalExecution = { ok: true, refundedMinor: 0, subscriptionCanceled: false, needsReview: false }

    if (purchase.kind === PurchaseKind.Subscription && purchase.subscriptionId != null) {
      if (await records.hasEvent(withdrawalId, 'subscription-cancel', undefined, true)) {
        outcome.subscriptionCanceled = true
      } else {
        try {
          if (paygate.subscriptions == null) {
            throw new PaygateError(`capability:subscriptions:${paygate.id}`)
          }
          const { alreadyCanceled } = await paygate.subscriptions.cancelNow(
            purchase.subscriptionId, call('subscription-cancel', `withdrawal:${withdrawalId}`),
          )
          outcome.subscriptionCanceled = true
          await event('subscription-cancel', alreadyCanceled
            ? { ok: true, externalId: purchase.subscriptionId, detail: '{"already":true}' }
            : { ok: true, externalId: purchase.subscriptionId })
        } catch (error) {
          outcome.ok = false
          await event('subscription-cancel', { externalId: purchase.subscriptionId, error: paymentUtils.errorText(error) })
        }
        if (outcome.subscriptionCanceled) {
          const row: PaymentSubscriptionRecord | null = await access.subscriptions().byExternalId(purchase.subscriptionId, purchase.paygate)
          if (row != null && row.withdrawnAt == null) {
            await access.subscriptions().update({ ...row, withdrawnAt: new Date(declaration.receivedAt) })
          }
        }
      }
    }

    if (await records.hasEvent(withdrawalId, 'refund', undefined, true)) {
      return { ...outcome, refundedMinor: declaration.refundMinor ?? computation.refundMinor }
    }
    if (computation.refundMinor <= 0) {
      return outcome
    }
    const payments = paygate.payments
    if (payments == null) {
      await event('refund', { error: `capability:payments:${paygate.id}`, amountMinor: computation.refundMinor, currency: purchase.currency })
      return { ...outcome, ok: false, needsReview: true }
    }

    let paymentIntentId = purchase.paymentIntentId
    let invoiceLineId = purchase.invoiceLineId
    if (purchase.invoiceId != null && (paymentIntentId == null || invoiceLineId == null)) {
      const invoice = await capture.invoiceEvidenceOf(paygate, purchase.invoiceId)
      paymentIntentId = paymentIntentId ?? invoice.paymentIntentId
      invoiceLineId = invoiceLineId ?? invoice.invoiceLineId
      await records.patchPurchase(purchase.purchaseId, paymentUtils.compact({
        paymentIntentId, invoiceLineId, invoiceNumber: purchase.invoiceNumber ?? invoice.invoiceNumber,
      }))
    }
    if (paymentIntentId == null) {
      await event('refund', { error: 'no-payment-intent', amountMinor: computation.refundMinor, currency: purchase.currency })
      return { ...outcome, ok: false, needsReview: true }
    }

    const open = Math.max(0, purchase.amountTotalMinor - (purchase.refundedMinor ?? 0))
    let amount = Math.min(open, computation.refundMinor)
    let line: CreditNoteLine | null = null
    if (payments.creditNotes != null && purchase.invoiceId != null && invoiceLineId != null && computation.netMinor > 0) {
      line = { invoiceId: purchase.invoiceId, lineId: invoiceLineId, amountMinor: computation.netMinor }
      try {
        const preview = await payments.creditNotes.preview(line)
        amount = Math.min(open, preview.totalMinor)
      } catch (error) {
        line = null
        await event('credit-note', { step: 'preview', error: paymentUtils.errorText(error) })
      }
    }
    if (amount <= 0) {
      return outcome
    }

    let refund: PaygateRefund
    try {
      const metadata = { withdrawalId, purchaseId: purchase.purchaseId }
      refund = (attempt > 0 ? await payments.findRefund(paymentIntentId, { withdrawalId }) : null)
        ?? await payments.refund({ paymentId: paymentIntentId, amountMinor: amount, metadata }, call('refund'))
    } catch (error) {
      await event('refund', { error: paymentUtils.errorText(error), amountMinor: amount, currency: purchase.currency })
      return { ...outcome, ok: false }
    }
    await event('refund', { ok: true, externalId: refund.id, amountMinor: refund.amountMinor, currency: refund.currency })
    outcome.refundId = refund.id
    outcome.refundedMinor = refund.amountMinor

    if (line != null && payments.creditNotes != null) {
      try {
        const note = await payments.creditNotes.create({
          ...line, refundId: refund.id, memo: memoOf(declaration, purchase),
          metadata: { withdrawalId, purchaseId: purchase.purchaseId },
        }, call('credit-note'))
        outcome.creditNoteId = note.id
        await event('credit-note', { ok: true, externalId: note.id, amountMinor: note.totalMinor, currency: note.currency })
      } catch (error) {
        // The refund stands; the corrective document is retried by reconcile.
        await event('credit-note', { error: paymentUtils.errorText(error), detail: JSON.stringify({ refundId: refund.id }) })
      }
    }

    return outcome
  }

  const retryCreditNote = async (
    paygate: Paygate, declaration: ConsumerDeclarationRecord, purchase: PurchaseRecord,
    netMinor: number, refundId: string, attempt: number,
  ): Promise<boolean> => {
    const withdrawalId = declaration.id as string
    const creditNotes = paygate.payments?.creditNotes
    if (creditNotes == null) {
      return false
    }
    let invoiceLineId = purchase.invoiceLineId
    if (invoiceLineId == null && purchase.invoiceId != null) {
      invoiceLineId = (await capture.invoiceEvidenceOf(paygate, purchase.invoiceId)).invoiceLineId
    }
    if (purchase.invoiceId == null || invoiceLineId == null || netMinor <= 0) {
      return false
    }
    try {
      const note: PaygateCreditNote = await creditNotes.find(purchase.invoiceId, { withdrawalId }) ?? await creditNotes.create({
        invoiceId: purchase.invoiceId, lineId: invoiceLineId, amountMinor: netMinor, refundId,
        memo: memoOf(declaration, purchase), metadata: { withdrawalId, purchaseId: purchase.purchaseId },
      }, { idempotencyKey: keyOf(withdrawalId, 'credit-note', attempt) })
      await records.recordEvent({
        recordId: withdrawalId, recordKind: 'declaration', entityId: purchase.entityId, action: 'credit-note', ok: true,
        externalId: note.id, amountMinor: note.totalMinor, currency: note.currency,
      })
      return true
    } catch (error) {
      await records.recordEvent({
        recordId: withdrawalId, recordKind: 'declaration', entityId: purchase.entityId, action: 'credit-note', ok: false,
        error: paymentUtils.errorText(error), detail: JSON.stringify({ refundId }),
      })
      return false
    }
  }

  return { computeWithdrawal, executeWithdrawal, retryCreditNote }
}

/** The withdrawals of a context — one per context. */
export const withdrawalOf = memoHelper.oncePer(makeWithdrawalHelper)
