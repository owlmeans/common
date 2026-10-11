import type Stripe from 'stripe'
import { SubscriptionStatus, TERMINAL_STATUSES } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import { STRIPE_PAYGATE_ALIAS } from '../consts.js'
import type { CommitResult, PaymentSubscriptionRecord, SubscriptionRef } from '../types.js'
import type { ApplyOptions, StripeSubscriptionsHelper } from './subscriptions/types.js'
import { log } from '../log.js'
import { RESYNC_PAGE } from './consts.local.js'
import { paymentAccessOf } from '../access.js'
import { paymentUtils } from '../utils.js'
import { catalogueOf } from '../catalogue.js'
import { planHelper } from '../plan.js'
import { subscriptionCommitOf } from '../commit.js'
import { customerLockHelper } from './customer-lock.js'
import { mapStatus } from './status.js'
import { captureOf } from '../consumer/capture.js'

const isPaused = (subscription: Pick<Stripe.Subscription, 'status' | 'pause_collection'>): boolean =>
  subscription.status === 'paused'
  || (subscription.pause_collection != null && (subscription.status === 'active' || subscription.status === 'trialing'))

/**
 * The current period. Top-level on the API version the client is pinned to; read through a narrow
 * accessor because later versions move it onto the subscription items.
 */
const periodOf = (subscription: Stripe.Subscription): { start?: Date, end?: Date } => {
  const typed = subscription as unknown as { current_period_start?: number | null, current_period_end?: number | null }
  return { start: paymentUtils.dateOf(typed.current_period_start), end: paymentUtils.dateOf(typed.current_period_end) }
}

const secondsFloor = (at: Date): Date => new Date(Math.floor(at.getTime() / 1000) * 1000)

export const makeStripeSubscriptionsHelper = (ctx: ApiContext): StripeSubscriptionsHelper => {
  const access = paymentAccessOf(ctx)

  const applySubscription = async (subscription: Stripe.Subscription, opts: ApplyOptions): Promise<CommitResult> => {
    const metadata = subscription.metadata ?? {}
    const customerId = paymentUtils.idOf(subscription.customer)
    const previous = await access.subscriptions().byExternalId(subscription.id, STRIPE_PAYGATE_ALIAS)

    let entityId: string | undefined = metadata.entityId ?? previous?.entityId
    if (entityId == null && customerId != null) {
      entityId = (await access.paygateCustomers().loadByPgId(customerId, STRIPE_PAYGATE_ALIAS))?.entityId ?? undefined
    }
    if (entityId == null) {
      log.warn('Subscription belongs to no known entity; ignored', { subscriptionId: subscription.id })
      return { record: previous, change: null, updated: false }
    }
    if (opts.eventId != null && previous?.lastEventId === opts.eventId) {
      return { record: previous, change: null, updated: false }
    }

    const now = new Date()
    const syncedAt = opts.eventCreated != null ? new Date(opts.eventCreated * 1000) : secondsFloor(now)
    if (opts.eventCreated != null && previous?.syncedAt != null
      && syncedAt.getTime() < new Date(previous.syncedAt).getTime()) {
      return { record: previous, change: null, updated: false }
    }

    const item = subscription.items?.data?.[0]
    // A price recreated by `sync.ts` (an opposite `tax_behavior`) loses its lookup key; its sku
    // metadata survives, so a subscription switched to it in the portal still resolves its plan.
    const planSku = item?.price?.lookup_key ?? item?.price?.metadata?.sku ?? metadata.planSku ?? previous?.planSku
    if (planSku == null) {
      log.warn('Subscription names no plan; ignored', { subscriptionId: subscription.id })
      return { record: previous, change: null, updated: false }
    }
    const plan = await catalogueOf(ctx).findPlan(planSku)
    const productSku = plan?.productSku ?? previous?.productSku ?? metadata.productSku ?? planSku
    const paused = opts.forced == null && isPaused(subscription)
    const period = periodOf(subscription)
    const terminal = opts.forced != null && TERMINAL_STATUSES.includes(opts.forced)

    const next = paymentUtils.compact({
      ...(previous ?? {}),
      entityId,
      planSku,
      productSku,
      service: metadata.service ?? previous?.service ?? productSku,
      paygate: STRIPE_PAYGATE_ALIAS,
      externalId: subscription.id,
      itemId: item?.id,
      priceId: item?.price?.id,
      status: opts.forced ?? mapStatus(subscription),
      externalStatus: subscription.status,
      rank: plan != null ? planHelper.planRank(plan) : previous?.rank ?? 0,
      periodStart: period.start,
      periodEnd: period.end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
      canceledAt: paymentUtils.dateOf(subscription.canceled_at),
      endedAt: paymentUtils.dateOf(subscription.ended_at) ?? (terminal ? previous?.endedAt ?? now : undefined),
      pausedAt: paused ? previous?.pausedAt ?? now : undefined,
      trialEnd: paymentUtils.dateOf(subscription.trial_end),
      latestInvoiceId: opts.invoiceId ?? paymentUtils.idOf(subscription.latest_invoice) ?? previous?.latestInvoiceId,
      customerId,
      currency: subscription.currency?.toLowerCase() ?? previous?.currency,
      createdAt: previous?.createdAt ?? paymentUtils.dateOf(subscription.created) ?? now,
      updatedAt: now,
      syncedAt,
    }) as PaymentSubscriptionRecord
    // `compact` drops every field the payload cleared — the stored record is replaced as a whole.

    return await subscriptionCommitOf(ctx).commitSubscription(previous, next, {
      eventId: opts.eventId, renewal: opts.renewal, invoiceId: opts.invoiceId, trialEnding: opts.trialEnding,
      // The first invoice is a purchase: its window exists before an observer grants the bundle.
      beforePropagate: async (record, change) => {
        if (change === 'created') {
          await captureOf(ctx).captureSubscriptionPurchase(opts.stripe ?? null, subscription, record)
        }
      },
    })
  }

  const retrieveSubscription = async (stripe: Stripe, id: string): Promise<Stripe.Subscription | null> => {
    try {
      return await stripe.subscriptions.retrieve(id)
    } catch (error) {
      if (paymentUtils.isMissingObject(error)) {
        return null
      }
      throw error
    }
  }

  const cancelMissing = async (externalId: string): Promise<CommitResult> => {
    const previous = await access.subscriptions().byExternalId(externalId, STRIPE_PAYGATE_ALIAS)
    if (previous == null || TERMINAL_STATUSES.includes(previous.status)) {
      return { record: previous, change: null, updated: false }
    }
    const now = new Date()

    return await subscriptionCommitOf(ctx).commitSubscription(previous, {
      ...previous, status: SubscriptionStatus.Canceled, endedAt: previous.endedAt ?? now, updatedAt: now,
      syncedAt: secondsFloor(now),
    })
  }

  const resyncStripeSubscription = async (stripe: Stripe, ref: SubscriptionRef): Promise<number> => {
    const ids = new Set<string>()
    if (ref.subscriptionId != null) {
      ids.add(ref.subscriptionId)
    }
    if (ref.entityId != null) {
      const { items } = await access.subscriptions().list({ entityId: ref.entityId, paygate: STRIPE_PAYGATE_ALIAS }, { size: 0 })
      items.forEach(row => ids.add(row.externalId))
    }

    let updated = 0
    for (const id of ids) {
      const subscription = await retrieveSubscription(stripe, id)
      const customerId = subscription != null ? paymentUtils.idOf(subscription.customer) : undefined
      const result = await customerLockHelper.withCustomerLock(customerId, async () => subscription != null
        ? await applySubscription(subscription, { source: 'resync', stripe })
        : await cancelMissing(id))
      if (result.updated) {
        updated++
      }
    }

    return updated
  }

  const resyncStripeSubscriptions = async (stripe: Stripe): Promise<{ scanned: number, updated: number }> => {
    const ids: string[] = []
    for (let page = 0; ; page++) {
      const { items } = await access.subscriptions().list(
        { paygate: STRIPE_PAYGATE_ALIAS, status: { $nin: [...TERMINAL_STATUSES] } },
        { size: RESYNC_PAGE, page, sort: ['createdAt'] },
      )
      ids.push(...items.map(row => row.externalId))
      if (items.length < RESYNC_PAGE) {
        break
      }
    }

    let updated = 0
    for (const subscriptionId of ids) {
      try {
        updated += await resyncStripeSubscription(stripe, { subscriptionId })
      } catch (error) {
        log.error('Subscription resync failed', { subscriptionId, error })
      }
    }

    return { scanned: ids.length, updated }
  }

  return {
    applySubscription, retrieveSubscription, cancelMissing, resyncStripeSubscription, resyncStripeSubscriptions,
  }
}

/** The Stripe subscriptions of a context — one per context. */
export const stripeSubscriptionsOf = memoHelper.oncePer(makeStripeSubscriptionsHelper)
