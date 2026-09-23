import type Stripe from 'stripe'
import {
  consumerText, oneTimeWithdrawalRefund, PurchaseKind, subscriptionWithdrawalRefund,
} from '@owlmeans/payment'
import type { WithdrawalEstimate } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { STRIPE_OWNER_KEY, STRIPE_OWNER_VALUE, STRIPE_PAYGATE_ALIAS } from '../consts.js'
import { findPlan } from '../plan.js'
import { compact, errorText, isMissingObject, subscriptions } from '../utils.js'
import { invoiceEvidenceOf } from './capture.js'
import { formatDate } from './format.js'
import { hasEvent, patchPurchase, purchaseRefOf, recordEvent } from './records.js'
import type {
  ConsumerDeclarationRecord, PaymentSubscriptionRecord, PurchaseRecord, UsageMeter, UsageReading,
} from '../types.js'

const DAY_MS = 86_400_000

/** What a withdrawal of one purchase reimburses, as computed at one instant. */
export interface WithdrawalComputation {
  reading: UsageReading
  /** Gross, tax included — what is refunded. */
  refundMinor: number
  /** Net of tax — the credit note's line amount. */
  netMinor: number
  estimate: WithdrawalEstimate
  /** The units the deduction counts: used after consent, plus settled debt and earlier claw-backs. */
  deducted: number
  /** What the application takes back from the balance: the purchase's units still unused. */
  unitsReturned: number
}

/**
 * The refund of a withdrawal from one purchase, in the consumer's favour (`@owlmeans/payment`
 * calculators). The meter's deduction is `usedAfter + settled + clawed`: units used after consent
 * (before it the consumer bears no cost), units that paid an earlier overdraft, units already
 * refunded by money. A subscription's `time` components count from its start request; without
 * one nothing is deducted for time.
 */
export const computeWithdrawal = async (
  ctx: ApiContext, meter: UsageMeter, purchase: PurchaseRecord, at: Date,
): Promise<WithdrawalComputation> => {
  const reading = await meter.used(ctx, compact({
    entityId: purchase.entityId, purchase: purchaseRefOf(purchase),
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
    const gross = oneTimeWithdrawalRefund({ paidMinor: paid, refundedMinor: refunded, unitsGranted: reading.granted, unitsUsed: deducted })
    const netRefund = oneTimeWithdrawalRefund({ paidMinor: net, refundedMinor: refundedNet, unitsGranted: reading.granted, unitsUsed: deducted })
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
    ? await subscriptions(ctx).byExternalId(purchase.subscriptionId, STRIPE_PAYGATE_ALIAS) : null
  const plan = purchase.planSku != null ? await findPlan(ctx, purchase.planSku) : null
  const purchasedAt = new Date(purchase.purchasedAt)
  const periodStart = subscription?.periodStart != null ? new Date(subscription.periodStart) : purchasedAt
  const periodEnd = subscription?.periodEnd != null ? new Date(subscription.periodEnd)
    : new Date(periodStart.getTime() + (plan?.recurring?.interval === 'year' ? 365 : 30) * DAY_MS)
  const result = subscriptionWithdrawalRefund({
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
    estimate: compact({
      refundMinor: result.refundMinor, currency: purchase.currency, timeDeductionMinor: result.timeDeductionMinor,
      unitsDeductionMinor: result.unitsDeductionMinor, elapsedDays: result.elapsedDays, periodDays: result.periodDays,
      unitsUsed: result.unitsUsed, unitsGranted: result.unitsGranted,
    }) as WithdrawalEstimate,
  }
}

export interface WithdrawalExecution {
  /** Every paygate step succeeded (or had nothing to do). */
  ok: boolean
  refundId?: string
  creditNoteId?: string
  refundedMinor: number
  subscriptionCanceled: boolean
  /** A step can never succeed without an operator (no payment to refund). */
  needsReview: boolean
}

/** A Stripe error that says the subscription is already gone. */
const alreadyCanceled = (error: unknown): boolean => isMissingObject(error)
  || /canceled subscription|already (been )?cancel/i.test((error as { message?: string } | null)?.message ?? '')

/** A refund this withdrawal already made (found by its metadata) — what a retry adopts. */
const existingRefund = async (stripe: Stripe, paymentIntentId: string, withdrawalId: string): Promise<Stripe.Refund | null> => {
  const { data } = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 })

  return data.find(refund => refund.metadata?.withdrawalId === withdrawalId && refund.status !== 'failed'
    && refund.status !== 'canceled') ?? null
}

/** A credit note this withdrawal already made — what a retry adopts. */
const existingCreditNote = async (stripe: Stripe, invoiceId: string, withdrawalId: string): Promise<Stripe.CreditNote | null> => {
  const { data } = await stripe.creditNotes.list({ invoice: invoiceId, limit: 100 })

  return data.find(note => note.metadata?.withdrawalId === withdrawalId && note.status !== 'void') ?? null
}

/**
 * Stripe replays the stored answer of an idempotency key — a failure too — for a day: a retry
 * uses a fresh key (`…:<attempt>`) and first adopts what an earlier attempt may have made.
 */
const keyOf = (withdrawalId: string, step: string, attempt: number): Stripe.RequestOptions => ({
  idempotencyKey: attempt > 0 ? `withdrawal:${withdrawalId}:${step}:${attempt}` : `withdrawal:${withdrawalId}:${step}`,
})

/**
 * Execute a withdrawal at the paygate, the first attempt of every call under the idempotency key
 * `withdrawal:<id>:<step>` (a retry by `reconcile` adopts what an earlier attempt made):
 *
 * 1. a subscription purchase: `subscriptions.cancel` at once, without proration or a final invoice;
 * 2. an invoice-backed purchase: `creditNotes.preview` of the invoice line at the net refund, then
 *    OUR `refunds.create` for the previewed total (metadata `withdrawalId` — the refund webhook then
 *    tells observers not to claw back), then `creditNotes.create` linking that refund — the
 *    corrective tax document; a failed credit note keeps the plain refund and is recorded;
 * 3. no invoice: a plain proportional refund on the payment intent.
 *
 * Steps that already succeeded (a recorded `ok` event) are skipped. Every step is an event.
 */
export const executeWithdrawal = async (
  ctx: ApiContext, stripe: Stripe, declaration: ConsumerDeclarationRecord, purchase: PurchaseRecord,
  computation: { refundMinor: number, netMinor: number }, opts: { attempt?: number } = {},
): Promise<WithdrawalExecution> => {
  const withdrawalId = declaration.id as string
  const attempt = opts.attempt ?? 0
  const key = (step: string): Stripe.RequestOptions => keyOf(withdrawalId, step, attempt)
  const event = (action: 'refund' | 'credit-note' | 'subscription-cancel', fields: Record<string, unknown>) =>
    recordEvent(ctx, {
      recordId: withdrawalId, recordKind: 'declaration', entityId: purchase.entityId, action, ok: false, ...fields,
    } as Parameters<typeof recordEvent>[1])
  const outcome: WithdrawalExecution = { ok: true, refundedMinor: 0, subscriptionCanceled: false, needsReview: false }

  if (purchase.kind === PurchaseKind.Subscription && purchase.subscriptionId != null) {
    if (await hasEvent(ctx, withdrawalId, 'subscription-cancel', undefined, true)) {
      outcome.subscriptionCanceled = true
    } else {
      try {
        await stripe.subscriptions.cancel(purchase.subscriptionId, {
          prorate: false, invoice_now: false, cancellation_details: { comment: `withdrawal:${withdrawalId}` },
        }, key('subscription-cancel'))
        outcome.subscriptionCanceled = true
        await event('subscription-cancel', { ok: true, externalId: purchase.subscriptionId })
      } catch (error) {
        if (alreadyCanceled(error)) {
          outcome.subscriptionCanceled = true
          await event('subscription-cancel', { ok: true, externalId: purchase.subscriptionId, detail: '{"already":true}' })
        } else {
          outcome.ok = false
          await event('subscription-cancel', { externalId: purchase.subscriptionId, error: errorText(error) })
        }
      }
      if (outcome.subscriptionCanceled) {
        const row: PaymentSubscriptionRecord | null = await subscriptions(ctx).byExternalId(purchase.subscriptionId, STRIPE_PAYGATE_ALIAS)
        if (row != null && row.withdrawnAt == null) {
          await subscriptions(ctx).update({ ...row, withdrawnAt: new Date(declaration.receivedAt) })
        }
      }
    }
  }

  if (await hasEvent(ctx, withdrawalId, 'refund', undefined, true)) {
    return { ...outcome, refundedMinor: declaration.refundMinor ?? computation.refundMinor }
  }
  if (computation.refundMinor <= 0) {
    return outcome
  }

  let paymentIntentId = purchase.paymentIntentId
  let invoiceLineId = purchase.invoiceLineId
  if (purchase.invoiceId != null && (paymentIntentId == null || invoiceLineId == null)) {
    const invoice = await invoiceEvidenceOf(stripe, purchase.invoiceId)
    paymentIntentId = paymentIntentId ?? invoice.paymentIntentId
    invoiceLineId = invoiceLineId ?? invoice.invoiceLineId
    await patchPurchase(ctx, purchase.purchaseId, compact({
      paymentIntentId, invoiceLineId, invoiceNumber: purchase.invoiceNumber ?? invoice.invoiceNumber,
    }))
  }
  if (paymentIntentId == null) {
    await event('refund', { error: 'no-payment-intent', amountMinor: computation.refundMinor, currency: purchase.currency })
    return { ...outcome, ok: false, needsReview: true }
  }

  const open = Math.max(0, purchase.amountTotalMinor - (purchase.refundedMinor ?? 0))
  let amount = Math.min(open, computation.refundMinor)
  let lines: Stripe.CreditNoteCreateParams.Line[] | null = null
  if (purchase.invoiceId != null && invoiceLineId != null && computation.netMinor > 0) {
    lines = [{ type: 'invoice_line_item', invoice_line_item: invoiceLineId, amount: computation.netMinor }]
    try {
      const preview = await stripe.creditNotes.preview({ invoice: purchase.invoiceId, lines })
      amount = Math.min(open, preview.total)
    } catch (error) {
      lines = null
      await event('credit-note', { step: 'preview', error: errorText(error) })
    }
  }
  if (amount <= 0) {
    return outcome
  }

  let refund: Stripe.Refund
  try {
    refund = (attempt > 0 ? await existingRefund(stripe, paymentIntentId, withdrawalId) : null)
      ?? await stripe.refunds.create({
        payment_intent: paymentIntentId, amount, reason: 'requested_by_customer',
        metadata: { [STRIPE_OWNER_KEY]: STRIPE_OWNER_VALUE, withdrawalId, purchaseId: purchase.purchaseId },
      }, key('refund'))
  } catch (error) {
    await event('refund', { error: errorText(error), amountMinor: amount, currency: purchase.currency })
    return { ...outcome, ok: false }
  }
  await event('refund', { ok: true, externalId: refund.id, amountMinor: refund.amount, currency: refund.currency })
  outcome.refundId = refund.id
  outcome.refundedMinor = refund.amount

  if (lines != null && purchase.invoiceId != null) {
    try {
      const note = await stripe.creditNotes.create({
        invoice: purchase.invoiceId, lines, refund: refund.id,
        memo: consumerText(declaration.language, 'credit-note.memo', {
          contractRef: purchase.contractRef, date: formatDate(new Date(declaration.receivedAt), declaration.language),
        }),
        metadata: { withdrawalId, purchaseId: purchase.purchaseId },
      }, key('credit-note'))
      outcome.creditNoteId = note.id
      await event('credit-note', { ok: true, externalId: note.id, amountMinor: note.total, currency: note.currency })
    } catch (error) {
      // The refund stands; the corrective document is retried by reconcile.
      await event('credit-note', { error: errorText(error), detail: JSON.stringify({ refundId: refund.id }) })
    }
  }

  return outcome
}

/** Retry a credit note that failed after its refund succeeded. */
export const retryCreditNote = async (
  ctx: ApiContext, stripe: Stripe, declaration: ConsumerDeclarationRecord, purchase: PurchaseRecord,
  netMinor: number, refundId: string, attempt: number,
): Promise<boolean> => {
  const withdrawalId = declaration.id as string
  let invoiceLineId = purchase.invoiceLineId
  if (invoiceLineId == null && purchase.invoiceId != null) {
    invoiceLineId = (await invoiceEvidenceOf(stripe, purchase.invoiceId)).invoiceLineId
  }
  if (purchase.invoiceId == null || invoiceLineId == null || netMinor <= 0) {
    return false
  }
  try {
    const note = await existingCreditNote(stripe, purchase.invoiceId, withdrawalId) ?? await stripe.creditNotes.create({
      invoice: purchase.invoiceId,
      lines: [{ type: 'invoice_line_item', invoice_line_item: invoiceLineId, amount: netMinor }],
      refund: refundId,
      memo: consumerText(declaration.language, 'credit-note.memo', {
        contractRef: purchase.contractRef, date: formatDate(new Date(declaration.receivedAt), declaration.language),
      }),
      metadata: { withdrawalId, purchaseId: purchase.purchaseId },
    }, keyOf(withdrawalId, 'credit-note', attempt))
    await recordEvent(ctx, {
      recordId: withdrawalId, recordKind: 'declaration', entityId: purchase.entityId, action: 'credit-note', ok: true,
      externalId: note.id, amountMinor: note.total, currency: note.currency,
    })
    return true
  } catch (error) {
    await recordEvent(ctx, {
      recordId: withdrawalId, recordKind: 'declaration', entityId: purchase.entityId, action: 'credit-note', ok: false,
      error: errorText(error), detail: JSON.stringify({ refundId }),
    })
    return false
  }
}
