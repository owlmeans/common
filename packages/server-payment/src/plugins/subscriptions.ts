import { INTERNAL_PAYGATE, SubscriptionStatus, TERMINAL_STATUSES } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { CommitResult, PaymentSubscriptionRecord, SubscriptionRef } from '../types.js'
import type { Paygate, PaygateSubscription } from '../paygate/types.js'
import type { ApplyOptions, PaygateSubscriptionsHelper } from './subscriptions/types.js'
import { log } from '../log.js'
import { RESYNC_PAGE } from './consts.local.js'
import { paymentAccessOf } from '../access.js'
import { paymentUtils } from '../utils.js'
import { catalogueOf } from '../catalogue.js'
import { planHelper } from '../plan.js'
import { subscriptionCommitOf } from '../commit.js'
import { paygatesOf } from '../paygate/registry.js'
import { customerLockHelper } from './customer-lock.js'
import { captureOf } from '../consumer/capture.js'

const secondsFloor = (at: Date): Date => new Date(Math.floor(at.getTime() / 1000) * 1000)

export const makePaygateSubscriptionsHelper = (ctx: ApiContext): PaygateSubscriptionsHelper => {
  const access = paymentAccessOf(ctx)

  const applySubscription = async (
    paygate: Paygate, subscription: PaygateSubscription, opts: ApplyOptions,
  ): Promise<CommitResult> => {
    const metadata = subscription.metadata ?? {}
    const customerId = subscription.customerId
    const previous = await access.subscriptions().byExternalId(subscription.id, paygate.id)

    let entityId: string | undefined = metadata.entityId ?? previous?.entityId
    if (entityId == null && customerId != null) {
      entityId = (await access.paygateCustomers().loadByPgId(customerId, paygate.id))?.entityId ?? undefined
    }
    if (entityId == null) {
      log.warn('Subscription belongs to no known entity; ignored', { subscriptionId: subscription.id })
      return { record: previous, change: null, updated: false }
    }
    if (opts.eventId != null && previous?.lastEventId === opts.eventId) {
      return { record: previous, change: null, updated: false }
    }

    const now = new Date()
    const syncedAt = opts.eventCreated ?? secondsFloor(now)
    if (opts.eventCreated != null && previous?.syncedAt != null
      && syncedAt.getTime() < new Date(previous.syncedAt).getTime()) {
      return { record: previous, change: null, updated: false }
    }

    // A price recreated by the catalogue sync (an opposite tax behavior) may lose its lookup key; the
    // paygate still names its plan, so a subscription switched to it in the portal resolves its plan.
    const planSku = subscription.planSku ?? metadata.planSku ?? previous?.planSku
    if (planSku == null) {
      log.warn('Subscription names no plan; ignored', { subscriptionId: subscription.id })
      return { record: previous, change: null, updated: false }
    }
    const plan = await catalogueOf(ctx).findPlan(planSku)
    const productSku = plan?.productSku ?? previous?.productSku ?? metadata.productSku ?? planSku
    const paused = opts.forced == null && subscription.paused
    const terminal = opts.forced != null && TERMINAL_STATUSES.includes(opts.forced)

    const next = paymentUtils.compact({
      ...(previous ?? {}),
      entityId,
      planSku,
      productSku,
      service: metadata.service ?? previous?.service ?? productSku,
      paygate: paygate.id,
      externalId: subscription.id,
      itemId: subscription.itemId,
      priceId: subscription.priceId,
      status: opts.forced ?? subscription.status,
      externalStatus: subscription.externalStatus,
      rank: plan != null ? planHelper.planRank(plan) : previous?.rank ?? 0,
      periodStart: subscription.periodStart,
      periodEnd: subscription.periodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd === true,
      canceledAt: subscription.canceledAt,
      endedAt: subscription.endedAt ?? (terminal ? previous?.endedAt ?? now : undefined),
      pausedAt: paused ? previous?.pausedAt ?? now : undefined,
      trialEnd: subscription.trialEnd,
      latestInvoiceId: opts.invoiceId ?? subscription.latestInvoiceId ?? previous?.latestInvoiceId,
      customerId,
      currency: subscription.currency?.toLowerCase() ?? previous?.currency,
      createdAt: previous?.createdAt ?? subscription.createdAt ?? now,
      updatedAt: now,
      syncedAt,
    }) as PaymentSubscriptionRecord
    // `compact` drops every field the payload cleared — the stored record is replaced as a whole.

    return await subscriptionCommitOf(ctx).commitSubscription(previous, next, {
      eventId: opts.eventId, renewal: opts.renewal, invoiceId: opts.invoiceId, trialEnding: opts.trialEnding,
      // The first invoice is a purchase: its window exists before an observer grants the bundle.
      beforePropagate: async (record, change) => {
        if (change === 'created') {
          await captureOf(ctx).captureSubscriptionPurchase(paygate, subscription, record)
        }
      },
    })
  }

  const retrieveSubscription = async (paygate: Paygate, id: string): Promise<PaygateSubscription | null> =>
    paygate.subscriptions != null ? await paygate.subscriptions.retrieve(id) : null

  const cancelMissing = async (paygate: Paygate, externalId: string): Promise<CommitResult> => {
    const previous = await access.subscriptions().byExternalId(externalId, paygate.id)
    if (previous == null || TERMINAL_STATUSES.includes(previous.status)) {
      return { record: previous, change: null, updated: false }
    }
    const now = new Date()

    return await subscriptionCommitOf(ctx).commitSubscription(previous, {
      ...previous, status: SubscriptionStatus.Canceled, endedAt: previous.endedAt ?? now, updatedAt: now,
      syncedAt: secondsFloor(now),
    })
  }

  /** A registered paygate that keeps subscriptions, or `null`. */
  const subscribingPaygate = (id: string | undefined): Paygate | null => {
    const paygate = id != null ? paygatesOf(ctx).find(id) : null

    return paygate?.subscriptions != null ? paygate : null
  }

  const resyncOne = async (paygate: Paygate, id: string): Promise<boolean> => {
    const subscription = await retrieveSubscription(paygate, id)
    const result = await customerLockHelper.withCustomerLock(paygate.id, subscription?.customerId, async () => subscription != null
      ? await applySubscription(paygate, subscription, { source: 'resync' })
      : await cancelMissing(paygate, id))

    return result.updated
  }

  const resyncSubscription = async (ref: SubscriptionRef): Promise<number> => {
    const targets = new Map<string, { paygate: Paygate, id: string }>()
    const add = (paygate: Paygate | null, id: string): void => {
      if (paygate != null && !targets.has(`${paygate.id}:${id}`)) {
        targets.set(`${paygate.id}:${id}`, { paygate, id })
      }
    }
    if (ref.subscriptionId != null) {
      const row = ref.paygate == null
        ? await access.subscriptions().load({ externalId: ref.subscriptionId, paygate: { $ne: INTERNAL_PAYGATE } })
        : null
      add(subscribingPaygate(ref.paygate ?? row?.paygate)
        ?? (ref.paygate == null && row == null ? paygatesOf(ctx).all().find(paygate => paygate.subscriptions != null) ?? null : null),
      ref.subscriptionId)
    }
    if (ref.entityId != null) {
      const { items } = await access.subscriptions().list(
        { entityId: ref.entityId, paygate: ref.paygate ?? { $ne: INTERNAL_PAYGATE } }, { size: 0 },
      )
      items.forEach(row => { add(subscribingPaygate(row.paygate), row.externalId) })
    }

    let updated = 0
    for (const { paygate, id } of targets.values()) {
      if (await resyncOne(paygate, id)) {
        updated++
      }
    }

    return updated
  }

  const resyncAll = async (): Promise<{ scanned: number, updated: number }> => {
    const rows: PaymentSubscriptionRecord[] = []
    for (let page = 0; ; page++) {
      const { items } = await access.subscriptions().list(
        { paygate: { $ne: INTERNAL_PAYGATE }, status: { $nin: [...TERMINAL_STATUSES] } },
        { size: RESYNC_PAGE, page, sort: ['createdAt'] },
      )
      rows.push(...items)
      if (items.length < RESYNC_PAGE) {
        break
      }
    }
    const targets = rows.filter(row => subscribingPaygate(row.paygate) != null)

    let updated = 0
    for (const row of targets) {
      try {
        updated += await resyncSubscription({ subscriptionId: row.externalId, paygate: row.paygate })
      } catch (error) {
        log.error('Subscription resync failed', { subscriptionId: row.externalId, paygate: row.paygate, error })
      }
    }

    return { scanned: targets.length, updated }
  }

  return { applySubscription, retrieveSubscription, cancelMissing, resyncSubscription, resyncAll }
}

/** The paygate subscriptions of a context — one per context. */
export const paygateSubscriptionsOf = memoHelper.oncePer(makePaygateSubscriptionsHelper)
