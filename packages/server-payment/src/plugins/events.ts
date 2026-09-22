import type Stripe from 'stripe'
import { Mutex } from 'async-mutex'
import {
  CheckoutPricingMode, PaygateError, SubscriptionStatus, TERMINAL_STATUSES,
} from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { STRIPE_PAYGATE_ALIAS } from '../consts.js'
import { findPlan, planRank } from '../plan.js'
import { commitSubscription } from '../subscription.js'
import type { CommitResult } from '../subscription.js'
import {
  compact, dateOf, fulfillments, idOf, isDuplicateKey, isMissingObject, observer, paygateCustomers,
  subscriptions,
} from '../utils.js'
import { resolvePaymentTarget, retrieveCharge } from './refunds.js'
import type { PaymentTarget } from './refunds.js'
import type {
  DisputePhase, PaymentFulfillmentRecord, PaymentSubscriptionRecord, SubscriptionRef, TopUpCompletion,
} from '../types.js'

const customerMutex: Record<string, Mutex> = {}

/** Serialize the work on one paygate customer within this process. */
const withCustomerLock = async <T>(customerId: string | undefined, fn: () => Promise<T>): Promise<T> => {
  const key = customerId ?? ''
  const mutex = customerMutex[key] = customerMutex[key] ?? new Mutex()
  const release = await mutex.acquire()
  try {
    return await fn()
  } finally {
    release()
    if (!mutex.isLocked()) {
      delete customerMutex[key]
    }
  }
}

/**
 * Stripe's subscription status as a `SubscriptionStatus`. `past_due` still entitles (flagged);
 * `unpaid`, `paused` and paused collection revoke until resumed.
 */
export const mapStatus = (subscription: Pick<Stripe.Subscription, 'status' | 'pause_collection'>): SubscriptionStatus => {
  switch (subscription.status) {
    case 'active':
      return subscription.pause_collection != null ? SubscriptionStatus.Suspended : SubscriptionStatus.Active
    case 'trialing':
      return subscription.pause_collection != null ? SubscriptionStatus.Suspended : SubscriptionStatus.Trial
    case 'past_due': return SubscriptionStatus.PastDue
    case 'unpaid': return SubscriptionStatus.Suspended
    case 'paused': return SubscriptionStatus.Suspended
    case 'incomplete': return SubscriptionStatus.Created
    case 'incomplete_expired': return SubscriptionStatus.Ended
    case 'canceled': return SubscriptionStatus.Canceled
    default: return SubscriptionStatus.Created
  }
}

const isPaused = (subscription: Pick<Stripe.Subscription, 'status' | 'pause_collection'>): boolean =>
  subscription.status === 'paused'
  || (subscription.pause_collection != null && (subscription.status === 'active' || subscription.status === 'trialing'))

/**
 * The current period. Top-level on the API version the client is pinned to; read through a narrow
 * accessor because later versions move it onto the subscription items.
 */
const periodOf = (subscription: Stripe.Subscription): { start?: Date, end?: Date } => {
  const typed = subscription as unknown as { current_period_start?: number | null, current_period_end?: number | null }
  return { start: dateOf(typed.current_period_start), end: dateOf(typed.current_period_end) }
}

/** `invoice.subscription`, top-level on the pinned API version. */
const subscriptionIdOfInvoice = (invoice: Stripe.Invoice): string | undefined =>
  idOf((invoice as unknown as { subscription?: string | { id?: string } | null }).subscription)

export interface ApplyOptions {
  source: 'webhook' | 'resync'
  eventId?: string
  /** `event.created` (epoch seconds) of a webhook payload; an older payload than the stored state is skipped. */
  eventCreated?: number
  renewal?: boolean
  invoiceId?: string
  trialEnding?: boolean
  /** Store this status whatever the payload says (a deleted subscription is canceled). */
  forced?: SubscriptionStatus
}

const secondsFloor = (at: Date): Date => new Date(Math.floor(at.getTime() / 1000) * 1000)

/**
 * Apply one Stripe subscription — from a webhook payload or a fresh retrieval — to its row, and
 * tell observers what changed. Shared by every webhook and by resync.
 */
export const applySubscription = async (
  ctx: ApiContext, subscription: Stripe.Subscription, opts: ApplyOptions,
): Promise<CommitResult> => {
  const metadata = subscription.metadata ?? {}
  const customerId = idOf(subscription.customer)
  const previous = await subscriptions(ctx).byExternalId(subscription.id, STRIPE_PAYGATE_ALIAS)

  let entityId: string | undefined = metadata.entityId ?? previous?.entityId
  if (entityId == null && customerId != null) {
    entityId = (await paygateCustomers(ctx).loadByPgId(customerId, STRIPE_PAYGATE_ALIAS))?.entityId ?? undefined
  }
  if (entityId == null) {
    console.warn(`[payment] subscription "${subscription.id}" belongs to no known entity; ignored`)
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
    console.warn(`[payment] subscription "${subscription.id}" names no plan; ignored`)
    return { record: previous, change: null, updated: false }
  }
  const plan = await findPlan(ctx, planSku)
  const productSku = plan?.productSku ?? previous?.productSku ?? metadata.productSku ?? planSku
  const paused = opts.forced == null && isPaused(subscription)
  const period = periodOf(subscription)
  const terminal = opts.forced != null && TERMINAL_STATUSES.includes(opts.forced)

  const next = compact({
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
    rank: plan != null ? planRank(plan) : previous?.rank ?? 0,
    periodStart: period.start,
    periodEnd: period.end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    canceledAt: dateOf(subscription.canceled_at),
    endedAt: dateOf(subscription.ended_at) ?? (terminal ? previous?.endedAt ?? now : undefined),
    pausedAt: paused ? previous?.pausedAt ?? now : undefined,
    trialEnd: dateOf(subscription.trial_end),
    latestInvoiceId: opts.invoiceId ?? idOf(subscription.latest_invoice) ?? previous?.latestInvoiceId,
    customerId,
    createdAt: previous?.createdAt ?? dateOf(subscription.created) ?? now,
    updatedAt: now,
    syncedAt,
  }) as PaymentSubscriptionRecord
  // `compact` drops every field the payload cleared — the stored record is replaced as a whole.

  return await commitSubscription(ctx, previous, next, {
    eventId: opts.eventId, renewal: opts.renewal, invoiceId: opts.invoiceId, trialEnding: opts.trialEnding,
  })
}

const retrieveSubscription = async (stripe: Stripe, id: string): Promise<Stripe.Subscription | null> => {
  try {
    return await stripe.subscriptions.retrieve(id)
  } catch (error) {
    if (isMissingObject(error)) {
      return null
    }
    throw error
  }
}

/** A row whose paygate subscription no longer exists is canceled (observers hear `canceled`). */
const cancelMissing = async (ctx: ApiContext, externalId: string): Promise<CommitResult> => {
  const previous = await subscriptions(ctx).byExternalId(externalId, STRIPE_PAYGATE_ALIAS)
  if (previous == null || TERMINAL_STATUSES.includes(previous.status)) {
    return { record: previous, change: null, updated: false }
  }
  const now = new Date()

  return await commitSubscription(ctx, previous, {
    ...previous, status: SubscriptionStatus.Canceled, endedAt: previous.endedAt ?? now, updatedAt: now,
    syncedAt: secondsFloor(now),
  })
}

/**
 * Re-read paygate subscriptions — one by id, or every row of one entity — and apply each as a
 * webhook would. A subscription the paygate no longer has is canceled.
 *
 * @returns how many rows changed
 */
export const resyncStripeSubscription = async (
  ctx: ApiContext, stripe: Stripe, ref: SubscriptionRef,
): Promise<number> => {
  const ids = new Set<string>()
  if (ref.subscriptionId != null) {
    ids.add(ref.subscriptionId)
  }
  if (ref.entityId != null) {
    const { items } = await subscriptions(ctx).list({ entityId: ref.entityId, paygate: STRIPE_PAYGATE_ALIAS }, { size: 0 })
    items.forEach(row => ids.add(row.externalId))
  }

  let updated = 0
  for (const id of ids) {
    const subscription = await retrieveSubscription(stripe, id)
    const customerId = subscription != null ? idOf(subscription.customer) : undefined
    const result = await withCustomerLock(customerId, async () => subscription != null
      ? await applySubscription(ctx, subscription, { source: 'resync' })
      : await cancelMissing(ctx, id))
    if (result.updated) {
      updated++
    }
  }

  return updated
}

const RESYNC_PAGE = 200

/** Resync every paygate subscription that is not already terminal. Errors per row are logged. */
export const resyncStripeSubscriptions = async (
  ctx: ApiContext, stripe: Stripe,
): Promise<{ scanned: number, updated: number }> => {
  const ids: string[] = []
  for (let page = 0; ; page++) {
    const { items } = await subscriptions(ctx).list(
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
      updated += await resyncStripeSubscription(ctx, stripe, { subscriptionId })
    } catch (error) {
      console.error(`[payment] resync of "${subscriptionId}" failed`, error)
    }
  }

  return { scanned: ids.length, updated }
}

const integerMetadata = (metadata: Stripe.Metadata, key: string): number => {
  const raw = metadata[key]
  const value = raw == null || raw.trim() === '' ? Number.NaN : Number(raw)
  if (!Number.isSafeInteger(value)) throw new PaygateError(`metadata:${key}`)
  return value
}

const DISPUTE_PHASES: Record<string, DisputePhase> = {
  'charge.dispute.created': 'opened',
  'charge.dispute.funds_withdrawn': 'funds-withdrawn',
  'charge.dispute.funds_reinstated': 'funds-reinstated',
  'charge.dispute.closed': 'closed',
}

type EventHandler = (event: Stripe.Event) => Promise<void>

/**
 * The Stripe event dispatch table. `process` runs the handler of an event type and ignores every
 * other type; a throw escapes so Stripe delivers the event again.
 */
export const createEventHandler = (ctx: ApiContext, stripe: Stripe) => {
  const upsertCustomer = async (customer: Stripe.Customer): Promise<void> => {
    await withCustomerLock(customer.id, async () => {
      const resource = paygateCustomers(ctx)
      const existing = await resource.loadByPgId(customer.id, STRIPE_PAYGATE_ALIAS)
      const data = compact({
        email: customer.email ?? undefined, name: customer.name ?? undefined,
        taxId: customer.tax_ids?.data?.[0]?.value ?? undefined,
        entityId: customer.metadata?.entityId ?? existing?.entityId ?? undefined,
        profileId: customer.metadata?.profileId ?? existing?.profileId ?? undefined,
      })
      if (existing == null) {
        try {
          await resource.create({ paygate: STRIPE_PAYGATE_ALIAS, externalId: customer.id, ...data })
        } catch (error) {
          if (!isDuplicateKey(error)) throw error
        }
      } else {
        const { deletedAt: _deleted, ...kept } = existing
        await resource.update({ ...kept, ...data })
      }
    })
  }

  const markCustomerDeleted = async (customer: Stripe.DeletedCustomer | Stripe.Customer): Promise<void> => {
    const resource = paygateCustomers(ctx)
    const existing = await resource.loadByPgId(customer.id, STRIPE_PAYGATE_ALIAS)
    if (existing != null && existing.deletedAt == null) {
      await resource.update({ ...existing, deletedAt: new Date() })
    }
  }

  const fulfillPayment = async (session: Stripe.Checkout.Session): Promise<void> => {
    if (session.mode !== 'payment' || session.payment_status !== 'paid') return
    const metadata = session.metadata ?? {}
    if (metadata.entityId == null || metadata.service == null || metadata.productSku == null) {
      throw new PaygateError('metadata:owner')
    }
    await withCustomerLock(idOf(session.customer), async () => {
      const ledger = fulfillments(ctx)
      let stored = await ledger.byExternalId(session.id, STRIPE_PAYGATE_ALIAS)
      if (stored?.fulfilledAt != null) return

      const amountMode = metadata.pricingMode === CheckoutPricingMode.Amount
      const base = {
        entityId: metadata.entityId, productSku: metadata.productSku, planSku: metadata.planSku,
        service: metadata.service, paygate: STRIPE_PAYGATE_ALIAS, externalId: session.id,
      }
      let completion: TopUpCompletion
      let record: Partial<PaymentFulfillmentRecord>
      if (amountMode) {
        const amountMinor = integerMetadata(metadata, 'amountMinor')
        const chargedMinor = integerMetadata(metadata, 'chargeAmountMinor')
        const currency = metadata.currency?.toLowerCase()
        const sourceChargedMinor = metadata.sourceChargeAmountMinor == null
          ? chargedMinor : integerMetadata(metadata, 'sourceChargeAmountMinor')
        const amountCurrency = (metadata.amountCurrency ?? currency)?.toLowerCase()
        if (currency == null || session.currency?.toLowerCase() !== currency
          || amountCurrency == null || session.amount_subtotal !== chargedMinor
          || amountMinor <= 0 || chargedMinor <= 0 || sourceChargedMinor < amountMinor
          || (amountCurrency === currency && sourceChargedMinor !== chargedMinor)) {
          throw new PaygateError('amount-mismatch')
        }
        record = {
          mode: CheckoutPricingMode.Amount, amountMinor, sourceChargeAmountMinor: sourceChargedMinor,
          amountCurrency, chargeAmountMinor: chargedMinor, currency,
        }
        completion = {
          ...base, mode: 'amount', amountMinor, sourceChargeAmountMinor: sourceChargedMinor,
          amountCurrency, chargeAmountMinor: chargedMinor, currency,
        }
      } else {
        if (metadata.currency != null && session.currency?.toLowerCase() !== metadata.currency.toLowerCase()) {
          throw new PaygateError('currency-mismatch')
        }
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 })
        const units = lineItems.data.reduce((sum, line) => sum + (line.quantity ?? 0), 0)
        if (units <= 0) throw new PaygateError('units')
        record = { mode: CheckoutPricingMode.Quantity, units, ...(session.currency != null ? { currency: session.currency } : {}) }
        completion = { ...base, mode: 'quantity', units }
      }

      const identifiers = compact({
        paymentIntentId: idOf(session.payment_intent), invoiceId: idOf(session.invoice),
      })
      if (stored == null) {
        try {
          stored = await ledger.create(compact({ ...base, ...record, ...identifiers, createdAt: new Date() }) as PaymentFulfillmentRecord)
        } catch (error) {
          if (!isDuplicateKey(error)) throw error
          stored = await ledger.byExternalId(session.id, STRIPE_PAYGATE_ALIAS)
          if (stored == null || stored.fulfilledAt != null) return
        }
      } else if (stored.paymentIntentId == null && identifiers.paymentIntentId != null) {
        stored = await ledger.update({ ...stored, ...identifiers })
      }
      await observer(ctx).propagateTopUp(completion, ctx)
      await ledger.update({ ...stored, fulfilledAt: new Date() })
    })
  }

  const checkoutFailed = async (session: Stripe.Checkout.Session): Promise<void> => {
    const metadata = session.metadata ?? {}
    const customerId = idOf(session.customer)
    const entityId = metadata.entityId
      ?? (customerId != null ? (await paygateCustomers(ctx).loadByPgId(customerId, STRIPE_PAYGATE_ALIAS))?.entityId : undefined)
    if (entityId == null) {
      console.warn(`[payment] failed checkout "${session.id}" belongs to no known entity`)
      return
    }
    if (session.mode === 'payment' && metadata.productSku != null && metadata.service != null) {
      const ledger = fulfillments(ctx)
      const stored = await ledger.byExternalId(session.id, STRIPE_PAYGATE_ALIAS)
      if (stored == null) {
        try {
          await ledger.create(compact({
            entityId, productSku: metadata.productSku, planSku: metadata.planSku, service: metadata.service,
            paygate: STRIPE_PAYGATE_ALIAS, externalId: session.id,
            mode: metadata.pricingMode === CheckoutPricingMode.Amount ? CheckoutPricingMode.Amount : CheckoutPricingMode.Quantity,
            paymentIntentId: idOf(session.payment_intent), createdAt: new Date(), failedAt: new Date(),
          }) as PaymentFulfillmentRecord)
        } catch (error) {
          if (!isDuplicateKey(error)) throw error
        }
      } else if (stored.failedAt == null && stored.fulfilledAt == null) {
        await ledger.update({ ...stored, failedAt: new Date() })
      }
    }
    await observer(ctx).propagatePaymentFailed(compact({
      entityId, kind: 'checkout' as const, externalId: session.id,
      subscriptionId: idOf(session.subscription), eventKey: `payment-failed:${session.id}:0`,
    }), ctx)
  }

  const purgeExpiredCheckout = async (session: Stripe.Checkout.Session): Promise<void> => {
    await fulfillments(ctx).purge({ paygate: STRIPE_PAYGATE_ALIAS, externalId: session.id, fulfilledAt: null })
  }

  const applyFromEvent = (opts: Partial<ApplyOptions> = {}): EventHandler => async event => {
    const subscription = event.data.object as Stripe.Subscription
    await withCustomerLock(idOf(subscription.customer), async () => {
      await applySubscription(ctx, subscription, {
        source: 'webhook', eventId: event.id, eventCreated: event.created, ...opts,
      })
    })
  }

  const reapplyInvoiceSubscription = async (
    event: Stripe.Event, invoice: Stripe.Invoice, opts: Partial<ApplyOptions> = {},
  ): Promise<CommitResult | null> => {
    const subscriptionId = subscriptionIdOfInvoice(invoice)
    if (subscriptionId == null) return null
    const subscription = await retrieveSubscription(stripe, subscriptionId)
    if (subscription == null) {
      return await withCustomerLock(idOf(invoice.customer), async () => await cancelMissing(ctx, subscriptionId))
    }

    return await withCustomerLock(idOf(subscription.customer), async () =>
      await applySubscription(ctx, subscription, { source: 'webhook', eventId: event.id, ...opts }))
  }

  const invoicePaid: EventHandler = async event => {
    const invoice = event.data.object as Stripe.Invoice
    if (invoice.billing_reason === 'subscription_cycle') {
      await reapplyInvoiceSubscription(event, invoice, { renewal: true, invoiceId: invoice.id })
      return
    }
    await refreshLatestInvoice(invoice, invoice.id)
  }

  const refreshLatestInvoice = async (invoice: Stripe.Invoice, latestInvoiceId?: string): Promise<void> => {
    const subscriptionId = subscriptionIdOfInvoice(invoice)
    if (subscriptionId == null) return
    await withCustomerLock(idOf(invoice.customer), async () => {
      const row = await subscriptions(ctx).byExternalId(subscriptionId, STRIPE_PAYGATE_ALIAS)
      if (row == null) return
      let latest = latestInvoiceId
      if (latest == null) {
        const subscription = await retrieveSubscription(stripe, subscriptionId)
        latest = idOf(subscription?.latest_invoice)
      }
      if (latest != null && row.latestInvoiceId !== latest) {
        await subscriptions(ctx).update({ ...row, latestInvoiceId: latest, updatedAt: new Date() })
      }
    })
  }

  const invoiceFailed: EventHandler = async event => {
    const invoice = event.data.object as Stripe.Invoice
    const result = await reapplyInvoiceSubscription(event, invoice)
    const customerId = idOf(invoice.customer)
    const entityId = result?.record?.entityId
      ?? (customerId != null ? (await paygateCustomers(ctx).loadByPgId(customerId, STRIPE_PAYGATE_ALIAS))?.entityId : undefined)
    if (entityId == null) {
      console.warn(`[payment] failed invoice "${invoice.id}" belongs to no known entity`)
      return
    }
    const attempt = invoice.attempt_count ?? 0
    await observer(ctx).propagatePaymentFailed(compact({
      entityId, kind: 'invoice' as const, externalId: invoice.id, subscriptionId: subscriptionIdOfInvoice(invoice),
      invoiceId: invoice.id, attempt, actionRequired: event.type === 'invoice.payment_action_required',
      nextAttemptAt: dateOf(invoice.next_payment_attempt), eventKey: `payment-failed:${invoice.id}:${attempt}`,
    }), ctx)
  }

  const targetFields = (target: PaymentTarget) => target.kind === 'fulfillment'
    ? compact({
      entityId: target.record.entityId, target: target.kind, productSku: target.record.productSku,
      planSku: target.record.planSku ?? undefined, externalId: target.record.externalId,
      netAmountMinor: target.record.amountMinor ?? undefined,
      chargeAmountMinor: target.record.chargeAmountMinor ?? undefined,
    })
    : compact({
      entityId: target.record.entityId, target: target.kind, productSku: target.record.productSku,
      planSku: target.record.planSku, externalId: target.record.externalId,
    })

  const processRefund = async (refund: Stripe.Refund, charge?: Stripe.Charge | null): Promise<void> => {
    if (refund.status !== 'succeeded') return
    const target = await resolvePaymentTarget(ctx, stripe, {
      paymentIntentId: idOf(refund.payment_intent), chargeId: idOf(refund.charge), charge,
    })
    if (target == null) {
      console.warn(`[payment] refund "${refund.id}" matches no fulfillment or subscription`)
      return
    }
    const chargeId = idOf(refund.charge)
    const refunded = target.charge ?? (chargeId != null ? await retrieveCharge(stripe, chargeId) : null)
    const refundedTotal = Math.max(refunded?.amount_refunded ?? 0, refund.amount)
    const paid = refunded?.amount
    if (target.kind === 'fulfillment') {
      await fulfillments(ctx).update(compact({
        ...target.record, refundedMinor: Math.max(target.record.refundedMinor ?? 0, refundedTotal),
        refundedAt: new Date(), chargeId: target.record.chargeId ?? refunded?.id,
      }))
    }
    await observer(ctx).propagateRefund(compact({
      ...targetFields(target),
      refundId: refund.id,
      paymentIntentId: target.paymentIntentId ?? idOf(refund.payment_intent),
      invoiceId: target.kind === 'subscription' ? target.invoiceId : target.record.invoiceId ?? undefined,
      amountMinor: refund.amount,
      refundedTotalMinor: refundedTotal,
      paidMinor: paid,
      currency: refund.currency,
      partial: paid != null ? refundedTotal < paid : false,
      eventKey: `refund:${refund.id}`,
    }) as Parameters<ReturnType<typeof observer>['propagateRefund']>[0], ctx)
  }

  const chargeRefunded: EventHandler = async event => {
    const charge = event.data.object as Stripe.Charge
    const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100 })
    for (const refund of refunds.data) {
      await processRefund(refund, charge)
    }
  }

  const refundChanged: EventHandler = async event => {
    await processRefund(event.data.object as Stripe.Refund)
  }

  const disputeChanged: EventHandler = async event => {
    const dispute = event.data.object as Stripe.Dispute
    const phase = DISPUTE_PHASES[event.type]
    const target = await resolvePaymentTarget(ctx, stripe, {
      paymentIntentId: idOf(dispute.payment_intent), chargeId: idOf(dispute.charge),
    })
    if (target == null) {
      console.warn(`[payment] dispute "${dispute.id}" matches no fulfillment or subscription`)
      return
    }
    const marks = { disputedAt: target.record.disputedAt ?? new Date(), disputeStatus: dispute.status }
    if (target.kind === 'fulfillment') {
      await fulfillments(ctx).update({ ...target.record, ...marks })
    } else {
      await subscriptions(ctx).update({ ...(target.record as PaymentSubscriptionRecord), ...marks })
    }
    await observer(ctx).propagateDispute(compact({
      ...targetFields(target), disputeId: dispute.id, phase, status: dispute.status,
      amountMinor: dispute.amount, currency: dispute.currency, eventKey: `dispute:${dispute.id}:${phase}`,
    }) as Parameters<ReturnType<typeof observer>['propagateDispute']>[0], ctx)
  }

  const handlers: Record<string, EventHandler> = {
    'customer.created': async event => { await upsertCustomer(event.data.object as Stripe.Customer) },
    'customer.updated': async event => { await upsertCustomer(event.data.object as Stripe.Customer) },
    'customer.deleted': async event => { await markCustomerDeleted(event.data.object as Stripe.Customer) },

    'checkout.session.completed': async event => { await fulfillPayment(event.data.object as Stripe.Checkout.Session) },
    'checkout.session.async_payment_succeeded': async event => {
      await fulfillPayment(event.data.object as Stripe.Checkout.Session)
    },
    'checkout.session.async_payment_failed': async event => {
      await checkoutFailed(event.data.object as Stripe.Checkout.Session)
    },
    'checkout.session.expired': async event => {
      await purgeExpiredCheckout(event.data.object as Stripe.Checkout.Session)
    },

    'customer.subscription.created': applyFromEvent(),
    'customer.subscription.updated': applyFromEvent(),
    'customer.subscription.pending_update_applied': applyFromEvent(),
    'customer.subscription.pending_update_expired': applyFromEvent(),
    'customer.subscription.paused': applyFromEvent(),
    'customer.subscription.resumed': applyFromEvent(),
    'customer.subscription.deleted': applyFromEvent({ forced: SubscriptionStatus.Canceled }),
    'customer.subscription.trial_will_end': applyFromEvent({ trialEnding: true }),

    'invoice.paid': invoicePaid,
    'invoice.payment_failed': invoiceFailed,
    'invoice.payment_action_required': invoiceFailed,
    // Enabled on the endpoint for an application's own use; it has no invoice id and nothing is due.
    'invoice.upcoming': async () => undefined,
    'invoice.marked_uncollectible': async event => {
      await reapplyInvoiceSubscription(event, event.data.object as Stripe.Invoice)
    },
    'invoice.voided': async event => { await refreshLatestInvoice(event.data.object as Stripe.Invoice) },

    'charge.refunded': chargeRefunded,
    'refund.created': refundChanged,
    'refund.updated': refundChanged,
    'refund.failed': async () => undefined,

    'charge.dispute.created': disputeChanged,
    'charge.dispute.funds_withdrawn': disputeChanged,
    'charge.dispute.funds_reinstated': disputeChanged,
    'charge.dispute.closed': disputeChanged,
  }

  return {
    handlers,
    process: async (event: Stripe.Event): Promise<void> => {
      const handler = handlers[event.type]
      if (handler != null) {
        await handler(event)
      }
    },
  }
}
