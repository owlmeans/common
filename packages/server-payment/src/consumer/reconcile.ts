import type Stripe from 'stripe'
import { MAILER_SERVICE } from '@owlmeans/mailer'
import {
  CancellationStatus, DeclarationKind, ENTITLING_STATUSES, PurchaseKind, WithdrawalStatus,
} from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { PURCHASE_BACKFILL_DAYS, STRIPE_PAYGATE_ALIAS } from '../consts.js'
import {
  billingProfiles, consumerConsents, consumerDeclarations, consumerEvents, consumerMailConfig, errorText, idOf,
  paygateCustomers, payment, purchases, subscriptions,
} from '../utils.js'
import {
  capturePaymentPurchase, captureSubscriptionPurchase, completeSubscriptionPurchase,
} from './capture.js'
import { sendConsumerMail } from './mail.js'
import { hasEvent, hasPaid, lockProfile, purchaseIdOf, wasUnlocked } from './records.js'
import {
  notifyCancellation, notifyConsent, notifyWithdrawal, scheduleCancellation,
} from './service.js'
import type { ConsumerRightsInternals } from './service.js'
import { executeWithdrawal, retryCreditNote } from './withdrawal.js'
import type {
  ConsumerEventRecord, ConsumerMailKind, ConsumerReconcileOptions, ConsumerReconcileResult, UsageReading,
} from '../types.js'

const DAY_MS = 86_400_000
/** A paygate step failed this often is left to an operator. */
const MAX_ATTEMPTS = 5

/** What `withdraw` computed for a declaration, read back from its `computed` event. */
const computedOf = async (ctx: ApiContext, withdrawalId: string) => {
  const event = await consumerEvents(ctx).load({ recordId: withdrawalId, action: 'computed', ok: true })
  if (event == null) {
    return null
  }
  const detail = JSON.parse(event.detail ?? '{}') as {
    reading?: UsageReading, deducted?: number, netMinor?: number, unitsReturned?: number,
  }

  return {
    reading: detail.reading ?? { granted: 0, used: 0, usedAfter: 0 },
    deducted: detail.deducted ?? 0,
    unitsReturned: detail.unitsReturned ?? 0,
    netMinor: detail.netMinor ?? 0,
    refundMinor: event.amountMinor ?? 0,
  }
}

const failures = async (ctx: ApiContext, recordId: string, action: ConsumerEventRecord['action']): Promise<number> =>
  await consumerEvents(ctx).count({ recordId, action, ok: false })

/** Every distinct (record, step) with a failed event since `since` and no success after all. */
const pendingSteps = async (
  ctx: ApiContext, action: ConsumerEventRecord['action'], since: Date, limit: number,
): Promise<ConsumerEventRecord[]> => {
  const { items } = await consumerEvents(ctx).list({ action, ok: false, at: { $gte: since } }, {
    size: limit * 4, sort: [{ field: 'at', order: 'desc' }],
  })
  const seen = new Set<string>()
  const pending: ConsumerEventRecord[] = []
  for (const event of items) {
    const key = `${event.recordId}:${event.step ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!await hasEvent(ctx, event.recordId, action, event.step ?? undefined, true)) {
      pending.push(event)
    }
    if (pending.length >= limit) break
  }

  return pending
}

const retryWithdrawals = async (
  ctx: ApiContext, stripe: Stripe, since: Date, limit: number, result: ConsumerReconcileResult,
): Promise<void> => {
  const { items } = await consumerDeclarations(ctx).list({
    kind: DeclarationKind.Withdrawal, status: WithdrawalStatus.Processing, matched: true, receivedAt: { $gte: since },
  }, { size: limit * 2, sort: [{ field: 'receivedAt', order: 'asc' }] })
  let handled = 0
  for (const declaration of items) {
    if (handled >= limit) break
    const id = declaration.id as string
    const purchase = declaration.purchaseId != null ? await purchases(ctx).byPurchaseId(declaration.purchaseId) : null
    // A declaration that lost the race for its purchase is a duplicate — never executed.
    if (purchase == null || purchase.withdrawalId !== id) continue
    const computed = await computedOf(ctx, id)
    const refundDone = (declaration.refundMinor ?? 0) <= 0 || await hasEvent(ctx, id, 'refund', undefined, true)
    const cancelDone = purchase.kind !== PurchaseKind.Subscription || await hasEvent(ctx, id, 'subscription-cancel', undefined, true)
    if (refundDone && cancelDone) {
      const refundEvent = await consumerEvents(ctx).load({ recordId: id, action: 'refund', ok: true })
      const noteFailed = await consumerEvents(ctx).load({ recordId: id, action: 'credit-note', ok: false, step: null })
      if (refundEvent?.externalId != null && noteFailed != null && computed != null
        && !await hasEvent(ctx, id, 'credit-note', undefined, true)) {
        const attempt = await failures(ctx, id, 'credit-note')
        if (attempt < MAX_ATTEMPTS) {
          handled++
          result.retried++
          if (!await retryCreditNote(ctx, stripe, declaration, purchase, computed.netMinor, refundEvent.externalId, attempt)) {
            result.failed++
          }
        }
      }
      continue
    }
    const attempt = Math.max(await failures(ctx, id, 'refund'), await failures(ctx, id, 'subscription-cancel'))
    if (attempt >= MAX_ATTEMPTS) continue
    handled++
    result.retried++
    try {
      const execution = await executeWithdrawal(ctx, stripe, declaration, purchase, {
        refundMinor: declaration.refundMinor ?? computed?.refundMinor ?? 0, netMinor: computed?.netMinor ?? 0,
      }, { attempt })
      if (!execution.ok) {
        result.failed++
        continue
      }
      if (!await hasEvent(ctx, id, 'observers', 'withdrawal')) {
        await notifyWithdrawal(ctx, declaration, purchase, WithdrawalStatus.Refunded, computed, execution)
      }
    } catch (error) {
      result.failed++
      console.error(`[payment] reconcile: withdrawal "${id}" failed`, error)
    }
  }
}

const retryCancellations = async (
  ctx: ApiContext, stripe: Stripe, since: Date, limit: number, result: ConsumerReconcileResult,
): Promise<void> => {
  const { items } = await consumerDeclarations(ctx).list({
    kind: DeclarationKind.Cancellation, status: CancellationStatus.Scheduled, matched: true, receivedAt: { $gte: since },
  }, { size: limit * 2, sort: [{ field: 'receivedAt', order: 'asc' }] })
  let handled = 0
  for (const declaration of items) {
    if (handled >= limit) break
    const id = declaration.id as string
    if (declaration.subscriptionId == null || await hasEvent(ctx, id, 'cancel-scheduled', undefined, true)) continue
    const attempt = await failures(ctx, id, 'cancel-scheduled')
    const row = await subscriptions(ctx).byExternalId(declaration.subscriptionId, STRIPE_PAYGATE_ALIAS)
    if (row == null || attempt >= MAX_ATTEMPTS) continue
    handled++
    result.retried++
    if (!await scheduleCancellation(ctx, stripe, declaration, row, attempt)) {
      result.failed++
    }
  }
}

const retryMails = async (ctx: ApiContext, since: Date, limit: number, result: ConsumerReconcileResult): Promise<void> => {
  const policy = await payment(ctx).consumerRightsPolicy()
  const alias = (await consumerMailConfig(ctx))?.alias ?? MAILER_SERVICE
  if (policy == null || (ctx as unknown as { hasService?: (alias: string) => boolean }).hasService?.(alias) !== true) {
    return
  }
  for (const event of await pendingSteps(ctx, 'mail', since, limit)) {
    if (event.step == null) continue
    if (await sendConsumerMail(ctx, policy, event.step as ConsumerMailKind, event.recordId)) {
      result.mailed++
    } else if (!await hasEvent(ctx, event.recordId, 'mail', event.step, true)) {
      result.failed++
    }
  }
}

const retryObservers = async (ctx: ApiContext, since: Date, limit: number, result: ConsumerReconcileResult): Promise<void> => {
  for (const event of await pendingSteps(ctx, 'observers', since, limit)) {
    let told = false
    try {
      if (event.step === 'consent') {
        const consent = await consumerConsents(ctx).load(event.recordId)
        told = consent != null && await notifyConsent(ctx, consent)
      } else if (event.step === 'withdrawal') {
        const declaration = await consumerDeclarations(ctx).load(event.recordId)
        const purchase = declaration?.purchaseId != null ? await purchases(ctx).byPurchaseId(declaration.purchaseId) : null
        if (declaration != null && purchase != null) {
          const refunded = await hasEvent(ctx, event.recordId, 'refund', undefined, true) || (declaration.refundMinor ?? 0) <= 0
          const refund = await consumerEvents(ctx).load({ recordId: event.recordId, action: 'refund', ok: true })
          const note = await consumerEvents(ctx).load({ recordId: event.recordId, action: 'credit-note', ok: true })
          told = await notifyWithdrawal(
            ctx, declaration, purchase,
            declaration.status === WithdrawalStatus.Processing && refunded ? WithdrawalStatus.Refunded : WithdrawalStatus.Review,
            await computedOf(ctx, event.recordId),
            refund != null ? {
              ok: true, refundId: refund.externalId ?? undefined, creditNoteId: note?.externalId ?? undefined,
              refundedMinor: refund.amountMinor ?? 0, needsReview: false,
              subscriptionCanceled: await hasEvent(ctx, event.recordId, 'subscription-cancel', undefined, true),
            } : null,
          )
        }
      } else if (event.step === 'cancellation') {
        const declaration = await consumerDeclarations(ctx).load(event.recordId)
        if (declaration != null) {
          const scheduled = await hasEvent(ctx, event.recordId, 'cancel-scheduled', undefined, true)
          told = await notifyCancellation(ctx, declaration, declaration.status === CancellationStatus.Scheduled && !scheduled
            ? CancellationStatus.Received : declaration.status as CancellationStatus)
        }
      }
    } catch (error) {
      console.error(`[payment] reconcile: observers of "${event.recordId}" failed`, error)
    }
    if (told) {
      result.observed++
    } else {
      result.failed++
    }
  }
}

/** Completed checkouts of the last days that have no purchase row (records only — no mail). */
const backfillPurchases = async (ctx: ApiContext, stripe: Stripe, limit: number, result: ConsumerReconcileResult): Promise<void> => {
  const from = Math.floor((Date.now() - PURCHASE_BACKFILL_DAYS * DAY_MS) / 1000)
  let startingAfter: string | undefined
  let scanned = 0
  for (;;) {
    const page = await stripe.checkout.sessions.list({
      created: { gte: from }, status: 'complete', limit: 100,
      ...(startingAfter != null ? { starting_after: startingAfter } : {}),
    })
    for (const session of page.data) {
      scanned++
      if (result.backfilled >= limit) return
      const metadata = session.metadata ?? {}
      if (metadata.entityId == null || metadata.productSku == null) continue
      try {
        if (session.mode === 'payment' && session.payment_status === 'paid') {
          if (await purchases(ctx).load({ sessionId: session.id }) != null) continue
          const amount = Number(metadata.amountMinor)
          const captured = await capturePaymentPurchase(ctx, stripe, session, {
            ...(Number.isSafeInteger(amount) && amount > 0 ? { netAmountMinor: amount } : {}),
            ...(metadata.amountCurrency != null ? { amountCurrency: metadata.amountCurrency } : {}),
            at: new Date(session.created * 1000),
          }, { mail: false })
          if (captured?.created === true) result.backfilled++
        } else if (session.mode === 'subscription') {
          const subscriptionId = idOf(session.subscription)
          if (subscriptionId == null || await purchases(ctx).byPurchaseId(purchaseIdOf(subscriptionId)) != null) continue
          const row = await subscriptions(ctx).byExternalId(subscriptionId, STRIPE_PAYGATE_ALIAS)
          if (row == null || !ENTITLING_STATUSES.includes(row.status)) continue
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          const captured = await captureSubscriptionPurchase(ctx, stripe, subscription, row)
          if (captured != null) {
            await completeSubscriptionPurchase(ctx, stripe, session, captured.purchase, { mail: false })
            if (captured.created) result.backfilled++
          }
        }
      } catch (error) {
        result.failed++
        console.error(`[payment] reconcile: backfill of "${session.id}" failed`, error)
      }
    }
    if (!page.has_more || page.data.length === 0 || scanned >= limit * 20) return
    startingAfter = page.data[page.data.length - 1].id
  }
}

/**
 * Organizations that paid before countries were locked: locked from their paygate customer's
 * address — never one an operator unlocked (its next completed purchase locks it).
 */
const lockLegacy = async (ctx: ApiContext, stripe: Stripe, limit: number, result: ConsumerReconcileResult): Promise<void> => {
  const policy = await payment(ctx).consumerRightsPolicy()
  if (policy?.mechanisms.countryLock !== true) {
    return
  }
  const { items } = await paygateCustomers(ctx).list({ paygate: STRIPE_PAYGATE_ALIAS, deletedAt: null }, { size: limit * 4 })
  for (const customer of items) {
    if (result.locked >= limit) return
    if (customer.entityId == null || await billingProfiles(ctx).byEntity(customer.entityId) != null) continue
    if (!await hasPaid(ctx, customer.entityId) || await wasUnlocked(ctx, customer.entityId)) continue
    try {
      let country = customer.country
      if (country == null) {
        const retrieved = await stripe.customers.retrieve(customer.externalId)
        country = (retrieved as Stripe.DeletedCustomer).deleted ? undefined : (retrieved as Stripe.Customer).address?.country ?? undefined
      }
      if (country == null) continue
      const { created } = await lockProfile(ctx, policy, {
        entityId: customer.entityId, country, source: 'customer', customerId: customer.externalId,
        email: customer.email ?? undefined,
      })
      if (created) result.locked++
    } catch (error) {
      result.failed++
      console.error(`[payment] reconcile: legacy lock of "${customer.entityId}" failed: ${errorText(error)}`)
    }
  }
}

/**
 * The consumer-rights repair an application runs nightly: retry the paygate steps of withdrawals
 * (refunds, credit notes, subscription cancels) and scheduled cancellations, failed mails and
 * failed observers; backfill purchases of completed checkouts of the last 16 days that have no
 * row; lock organizations that paid before countries were locked. The paygate steps, the
 * backfill and the legacy locks need a managed service. Each step handles at most `limit` items.
 */
export const reconcileConsumerRights = async (
  ctx: ApiContext, internals: ConsumerRightsInternals, opts: ConsumerReconcileOptions = {},
): Promise<ConsumerReconcileResult> => {
  const result: ConsumerReconcileResult = { retried: 0, mailed: 0, observed: 0, backfilled: 0, locked: 0, failed: 0 }
  if (await payment(ctx).consumerRightsPolicy() == null) {
    return result
  }
  const limit = Math.max(1, opts.limit ?? 50)
  const since = opts.since ?? new Date(Date.now() - 30 * DAY_MS)
  const stripe = internals.managed ? await internals.stripe(ctx) : null
  const steps: Array<[string, () => Promise<void>]> = [
    ...(stripe != null ? [
      ['withdrawals', async () => { await retryWithdrawals(ctx, stripe, since, limit, result) }],
      ['cancellations', async () => { await retryCancellations(ctx, stripe, since, limit, result) }],
    ] as Array<[string, () => Promise<void>]> : []),
    ['mails', async () => { await retryMails(ctx, since, limit, result) }],
    ['observers', async () => { await retryObservers(ctx, since, limit, result) }],
    ...(stripe != null ? [
      ['backfill', async () => { await backfillPurchases(ctx, stripe, limit, result) }],
      ['legacy locks', async () => { await lockLegacy(ctx, stripe, limit, result) }],
    ] as Array<[string, () => Promise<void>]> : []),
  ]
  for (const [name, step] of steps) {
    try {
      await step()
    } catch (error) {
      result.failed++
      console.error(`[payment] consumer-rights reconcile step "${name}" failed`, error)
    }
  }

  return result
}
