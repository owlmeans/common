import { MAILER_SERVICE } from '@owlmeans/mailer'
import {
  CancellationStatus, DeclarationKind, ENTITLING_STATUSES, INTERNAL_PAYGATE, PaygateError, PurchaseKind, WithdrawalStatus,
} from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { PURCHASE_BACKFILL_DAYS } from '../consts.js'
import type { ConsumerRightsInternals, WithdrawalComputation } from './types.js'
import type {
  ConsumerEventRecord, ConsumerMailKind, ConsumerReconcileOptions, ConsumerReconcileResult, UsageReading,
} from '../types.js'
import { log } from '../log.js'
import { DAY_MS, MAX_ATTEMPTS } from './consts.local.js'
import { paymentAccessOf } from '../access.js'
import { consumerRecordsOf } from './records.js'
import { captureOf } from './capture.js'
import { checkoutSnapshotHelper } from '../plugins/snapshot.js'
import { paygatesOf } from '../paygate/registry.js'
import { consumerMailOf } from './mail.js'
import { consumerObserversOf } from './observers.js'
import { cancellationOf } from './cancellation.js'
import { withdrawalOf } from './withdrawal.js'
import type { ConsumerReconcileHelper } from './reconcile/types.js'

export const makeConsumerReconcileHelper = (
  ctx: ApiContext, internals: ConsumerRightsInternals,
): ConsumerReconcileHelper => {
  const access = paymentAccessOf(ctx)
  const records = consumerRecordsOf(ctx)

  /** What `withdraw` computed for a declaration, read back from its `computed` event. */
  const computedOf = async (
    withdrawalId: string,
  ): Promise<Pick<WithdrawalComputation, 'reading' | 'deducted' | 'unitsReturned' | 'netMinor' | 'refundMinor'> | null> => {
    const event = await access.consumerEvents().load({ recordId: withdrawalId, action: 'computed', ok: true })
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

  const failures = async (recordId: string, action: ConsumerEventRecord['action']): Promise<number> =>
    await access.consumerEvents().count({ recordId, action, ok: false })

  /** Every distinct (record, step) with a failed event since `since` and no success after all. */
  const pendingSteps = async (
    action: ConsumerEventRecord['action'], since: Date, limit: number,
  ): Promise<ConsumerEventRecord[]> => {
    const { items } = await access.consumerEvents().list({ action, ok: false, at: { $gte: since } }, {
      size: limit * 4, sort: [{ field: 'at', order: 'desc' }],
    })
    const seen = new Set<string>()
    const pending: ConsumerEventRecord[] = []
    for (const event of items) {
      const key = `${event.recordId}:${event.step ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      if (!await records.hasEvent(event.recordId, action, event.step ?? undefined, true)) {
        pending.push(event)
      }
      if (pending.length >= limit) break
    }

    return pending
  }

  const retryWithdrawals = async (since: Date, limit: number, result: ConsumerReconcileResult): Promise<void> => {
    const { items } = await access.consumerDeclarations().list({
      kind: DeclarationKind.Withdrawal, status: WithdrawalStatus.Processing, matched: true, receivedAt: { $gte: since },
    }, { size: limit * 2, sort: [{ field: 'receivedAt', order: 'asc' }] })
    let handled = 0
    for (const declaration of items) {
      if (handled >= limit) break
      const id = declaration.id as string
      const purchase = declaration.purchaseId != null ? await access.purchases().byPurchaseId(declaration.purchaseId) : null
      // A declaration that lost the race for its purchase is a duplicate — never executed.
      if (purchase == null || purchase.withdrawalId !== id) continue
      const paygate = paygatesOf(ctx).find(purchase.paygate)
      if (paygate == null) continue
      const computed = await computedOf(id)
      const refundDone = (declaration.refundMinor ?? 0) <= 0 || await records.hasEvent(id, 'refund', undefined, true)
      const cancelDone = purchase.kind !== PurchaseKind.Subscription
        || await records.hasEvent(id, 'subscription-cancel', undefined, true)
      if (refundDone && cancelDone) {
        const refundEvent = await access.consumerEvents().load({ recordId: id, action: 'refund', ok: true })
        const noteFailed = await access.consumerEvents().load({ recordId: id, action: 'credit-note', ok: false, step: null })
        if (refundEvent?.externalId != null && noteFailed != null && computed != null
          && !await records.hasEvent(id, 'credit-note', undefined, true)) {
          const attempt = await failures(id, 'credit-note')
          if (attempt < MAX_ATTEMPTS) {
            handled++
            result.retried++
            if (!await withdrawalOf(ctx).retryCreditNote(paygate, declaration, purchase, computed.netMinor, refundEvent.externalId, attempt)) {
              result.failed++
            }
          }
        }
        continue
      }
      const attempt = Math.max(await failures(id, 'refund'), await failures(id, 'subscription-cancel'))
      if (attempt >= MAX_ATTEMPTS) continue
      handled++
      result.retried++
      try {
        const execution = await withdrawalOf(ctx).executeWithdrawal(paygate, declaration, purchase, {
          refundMinor: declaration.refundMinor ?? computed?.refundMinor ?? 0, netMinor: computed?.netMinor ?? 0,
        }, { attempt })
        if (!execution.ok) {
          result.failed++
          continue
        }
        if (!await records.hasEvent(id, 'observers', 'withdrawal')) {
          await consumerObserversOf(ctx).notifyWithdrawal(declaration, purchase, WithdrawalStatus.Refunded, computed, execution)
        }
      } catch (error) {
        result.failed++
        log.error('Reconcile: withdrawal failed', { id, error })
      }
    }
  }

  const retryCancellations = async (since: Date, limit: number, result: ConsumerReconcileResult): Promise<void> => {
    const { items } = await access.consumerDeclarations().list({
      kind: DeclarationKind.Cancellation, status: CancellationStatus.Scheduled, matched: true, receivedAt: { $gte: since },
    }, { size: limit * 2, sort: [{ field: 'receivedAt', order: 'asc' }] })
    let handled = 0
    for (const declaration of items) {
      if (handled >= limit) break
      const id = declaration.id as string
      if (declaration.subscriptionId == null
        || await records.hasEvent(id, 'cancel-scheduled', undefined, true)) continue
      const attempt = await failures(id, 'cancel-scheduled')
      const row = await access.subscriptions().load({ externalId: declaration.subscriptionId, paygate: { $ne: INTERNAL_PAYGATE } })
      const paygate = row != null ? paygatesOf(ctx).find(row.paygate) : null
      if (row == null || paygate == null || attempt >= MAX_ATTEMPTS) continue
      handled++
      result.retried++
      if (!await cancellationOf(ctx).scheduleCancellation(paygate, declaration, row, attempt)) {
        result.failed++
      }
    }
  }

  const retryMails = async (since: Date, limit: number, result: ConsumerReconcileResult): Promise<void> => {
    const policy = await access.payment().consumerRightsPolicy()
    const alias = (await access.consumerMailConfig())?.alias ?? MAILER_SERVICE
    if (policy == null || (ctx as unknown as { hasService?: (alias: string) => boolean }).hasService?.(alias) !== true) {
      return
    }
    for (const event of await pendingSteps('mail', since, limit)) {
      if (event.step == null) continue
      if (await consumerMailOf(ctx).sendConsumerMail(policy, event.step as ConsumerMailKind, event.recordId)) {
        result.mailed++
      } else if (!await records.hasEvent(event.recordId, 'mail', event.step, true)) {
        result.failed++
      }
    }
  }

  const retryObservers = async (since: Date, limit: number, result: ConsumerReconcileResult): Promise<void> => {
    for (const event of await pendingSteps('observers', since, limit)) {
      let told = false
      try {
        if (event.step === 'consent') {
          const consent = await access.consumerConsents().load(event.recordId)
          told = consent != null && await consumerObserversOf(ctx).notifyConsent(consent)
        } else if (event.step === 'withdrawal') {
          const declaration = await access.consumerDeclarations().load(event.recordId)
          const purchase = declaration?.purchaseId != null ? await access.purchases().byPurchaseId(declaration.purchaseId) : null
          if (declaration != null && purchase != null) {
            const refunded = await records.hasEvent(event.recordId, 'refund', undefined, true)
              || (declaration.refundMinor ?? 0) <= 0
            const refund = await access.consumerEvents().load({ recordId: event.recordId, action: 'refund', ok: true })
            const note = await access.consumerEvents().load({ recordId: event.recordId, action: 'credit-note', ok: true })
            told = await consumerObserversOf(ctx).notifyWithdrawal(
              declaration, purchase,
              declaration.status === WithdrawalStatus.Processing && refunded ? WithdrawalStatus.Refunded : WithdrawalStatus.Review,
              await computedOf(event.recordId),
              refund != null ? {
                ok: true, refundId: refund.externalId ?? undefined, creditNoteId: note?.externalId ?? undefined,
                refundedMinor: refund.amountMinor ?? 0, needsReview: false,
                subscriptionCanceled: await records.hasEvent(event.recordId, 'subscription-cancel', undefined, true),
              } : null,
            )
          }
        } else if (event.step === 'cancellation') {
          const declaration = await access.consumerDeclarations().load(event.recordId)
          if (declaration != null) {
            const scheduled = await records.hasEvent(event.recordId, 'cancel-scheduled', undefined, true)
            told = await consumerObserversOf(ctx).notifyCancellation(declaration,
              declaration.status === CancellationStatus.Scheduled && !scheduled
                ? CancellationStatus.Received : declaration.status as CancellationStatus)
          }
        }
      } catch (error) {
        log.error('Reconcile: observers failed', { recordId: event.recordId, error })
      }
      if (told) {
        result.observed++
      } else {
        result.failed++
      }
    }
  }

  /** Completed checkouts of the last days that have no purchase row (records only — no mail). */
  const backfillPurchases = async (limit: number, result: ConsumerReconcileResult): Promise<void> => {
    const from = new Date(Math.floor((Date.now() - PURCHASE_BACKFILL_DAYS * DAY_MS) / 1000) * 1000)
    for (const paygate of paygatesOf(ctx).all()) {
      const listCompleted = paygate.checkout.listCompleted
      if (listCompleted == null) continue
      let cursor: string | undefined
      let scanned = 0
      for (;;) {
        const page = await listCompleted(from, cursor)
        for (const session of page.items) {
          scanned++
          if (result.backfilled >= limit) return
          const metadata = session.metadata ?? {}
          if (metadata.entityId == null || metadata.productSku == null) continue
          try {
            if (checkoutSnapshotHelper.canFulfill(session)) {
              if (await access.purchases().load({ sessionId: session.id }) != null) continue
              const amount = Number(metadata.amountMinor)
              const captured = await captureOf(ctx).capturePaymentPurchase(paygate, session, {
                ...(Number.isSafeInteger(amount) && amount > 0 ? { netAmountMinor: amount } : {}),
                ...(metadata.amountCurrency != null ? { amountCurrency: metadata.amountCurrency } : {}),
                ...(session.createdAt != null ? { at: session.createdAt } : {}),
              }, { mail: false })
              if (captured?.created === true) result.backfilled++
            } else if (session.mode === 'subscription') {
              const subscriptionId = session.subscriptionId
              if (subscriptionId == null
                || await access.purchases().byPurchaseId(records.purchaseIdOf(paygate.id, subscriptionId)) != null) continue
              const row = await access.subscriptions().byExternalId(subscriptionId, paygate.id)
              if (row == null || !ENTITLING_STATUSES.includes(row.status)) continue
              const subscription = paygate.subscriptions != null ? await paygate.subscriptions.retrieve(subscriptionId) : null
              if (subscription == null) throw new PaygateError(`subscription:${subscriptionId}`)
              const captured = await captureOf(ctx).captureSubscriptionPurchase(paygate, subscription, row)
              if (captured != null) {
                await captureOf(ctx).completeSubscriptionPurchase(paygate, session, captured.purchase, { mail: false })
                if (captured.created) result.backfilled++
              }
            }
          } catch (error) {
            result.failed++
            log.error('Reconcile: purchase backfill failed', { sessionId: session.id, paygate: paygate.id, error })
          }
        }
        if (page.cursor == null || page.items.length === 0 || scanned >= limit * 20) break
        cursor = page.cursor
      }
    }
  }

  /**
   * Organizations that paid before countries were locked: locked from their paygate customer's
   * address — never one an operator unlocked (its next completed purchase locks it).
   */
  const lockLegacy = async (limit: number, result: ConsumerReconcileResult): Promise<void> => {
    const policy = await access.payment().consumerRightsPolicy()
    if (policy?.mechanisms.countryLock !== true) {
      return
    }
    const { items } = await access.paygateCustomers().list({ paygate: { $ne: INTERNAL_PAYGATE }, deletedAt: null }, { size: limit * 4 })
    for (const customer of items) {
      if (result.locked >= limit) return
      if (customer.entityId == null || await access.billingProfiles().byEntity(customer.entityId) != null) continue
      if (!await records.hasPaid(customer.entityId) || await records.wasUnlocked(customer.entityId)) continue
      const paygate = paygatesOf(ctx).find(customer.paygate)
      if (paygate == null) continue
      try {
        let country = customer.country
        if (country == null) {
          country = (await paygate.customers.retrieve(customer.externalId))?.country ?? undefined
        }
        if (country == null) continue
        const { created } = await records.lockProfile(policy, {
          entityId: customer.entityId, country, source: 'customer', paygate: paygate.id, customerId: customer.externalId,
          email: customer.email ?? undefined,
        })
        if (created) result.locked++
      } catch (error) {
        result.failed++
        log.error('Reconcile: legacy billing-country lock failed', { entityId: customer.entityId, error })
      }
    }
  }

  const reconcile = async (opts: ConsumerReconcileOptions = {}): Promise<ConsumerReconcileResult> => {
    const result: ConsumerReconcileResult = { retried: 0, mailed: 0, observed: 0, backfilled: 0, locked: 0, failed: 0 }
    if (await access.payment().consumerRightsPolicy() == null) {
      return result
    }
    const limit = Math.max(1, opts.limit ?? 50)
    const since = opts.since ?? new Date(Date.now() - 30 * DAY_MS)
    const managed = internals.managed
    const steps: Array<[string, () => Promise<void>]> = [
      ...(managed ? [
        ['withdrawals', async () => { await retryWithdrawals(since, limit, result) }],
        ['cancellations', async () => { await retryCancellations(since, limit, result) }],
      ] as Array<[string, () => Promise<void>]> : []),
      ['mails', async () => { await retryMails(since, limit, result) }],
      ['observers', async () => { await retryObservers(since, limit, result) }],
      ...(managed ? [
        ['backfill', async () => { await backfillPurchases(limit, result) }],
        ['legacy locks', async () => { await lockLegacy(limit, result) }],
      ] as Array<[string, () => Promise<void>]> : []),
    ]
    for (const [name, step] of steps) {
      try {
        await step()
      } catch (error) {
        result.failed++
        log.error('Consumer-rights reconcile step failed', { step: name, error })
      }
    }

    return result
  }

  return { reconcile }
}
