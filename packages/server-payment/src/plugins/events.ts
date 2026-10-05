import type Stripe from 'stripe'
import { CheckoutPricingMode, ENTITLING_STATUSES, PaygateError, SubscriptionStatus } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { GATEWAY_SERVICE, STRIPE_PAYGATE_ALIAS } from '../consts.js'
import type {
  CommitResult, CheckoutOutcome, CheckoutPlugin, DisputeEvent, PaymentFulfillmentRecord, PaymentSubscriptionRecord,
  RefundEvent, TopUpCompletion,
} from '../types.js'
import type { PaymentTarget } from './refunds/types.js'
import type { ApplyOptions } from './subscriptions/types.js'
import { log } from '../log.js'
import { DISPUTE_PHASES } from './consts.local.js'
import type { EventHandler, StripeEventHandler } from './events/types.js'
import { paymentAccessOf } from '../access.js'
import { paymentUtils } from '../utils.js'
import { checkoutPluginsOf } from './checkout-plugins.js'
import { paymentTargetOf } from './refunds.js'
import { customerLockHelper } from './customer-lock.js'
import { stripeSubscriptionsOf } from './subscriptions.js'
import { consumerRecordsOf } from '../consumer/records.js'
import { captureOf } from '../consumer/capture.js'

/** `invoice.subscription`, top-level on the pinned API version. */
const subscriptionIdOfInvoice = (invoice: Stripe.Invoice): string | undefined =>
  paymentUtils.idOf((invoice as unknown as { subscription?: string | { id?: string } | null }).subscription)

const integerMetadata = (metadata: Stripe.Metadata, key: string): number => {
  const raw = metadata[key]
  const value = raw == null || raw.trim() === '' ? Number.NaN : Number(raw)
  if (!Number.isSafeInteger(value)) throw new PaygateError(`metadata:${key}`)
  return value
}

/**
 * The Stripe event dispatch table. `process` runs the handler of an event type and ignores every
 * other type; a throw escapes so Stripe delivers the event again.
 */
export const createEventHandler = (ctx: ApiContext, stripe: Stripe): StripeEventHandler => {
  const access = paymentAccessOf(ctx)
  const stripeSubscriptions = stripeSubscriptionsOf(ctx)

  /** The registered checkout plugins — none in a context without a gateway service. */
  const registeredPlugins = (): readonly CheckoutPlugin[] =>
    (ctx as unknown as { hasService?: (alias: string) => boolean }).hasService?.(GATEWAY_SERVICE) === true
      ? access.gateway().checkoutPlugins?.() ?? [] : []

  const upsertCustomer = async (customer: Stripe.Customer): Promise<void> => {
    await customerLockHelper.withCustomerLock(customer.id, async () => {
      const resource = access.paygateCustomers()
      const existing = await resource.loadByPgId(customer.id, STRIPE_PAYGATE_ALIAS)
      const data = paymentUtils.compact({
        email: customer.email ?? undefined, name: customer.name ?? undefined,
        taxId: customer.tax_ids?.data?.[0]?.value ?? undefined,
        country: customer.address?.country?.toUpperCase() ?? undefined,
        currency: customer.currency?.toLowerCase() ?? undefined,
        entityId: customer.metadata?.entityId ?? existing?.entityId ?? undefined,
        profileId: customer.metadata?.profileId ?? existing?.profileId ?? undefined,
      })
      if (existing == null) {
        try {
          await resource.create({ paygate: STRIPE_PAYGATE_ALIAS, externalId: customer.id, ...data })
        } catch (error) {
          if (!paymentUtils.isDuplicateKey(error)) throw error
        }
      } else {
        const { deletedAt: _deleted, ...kept } = existing
        await resource.update({ ...kept, ...data })
      }
    })
  }

  const markCustomerDeleted = async (customer: Stripe.DeletedCustomer | Stripe.Customer): Promise<void> => {
    const resource = access.paygateCustomers()
    const existing = await resource.loadByPgId(customer.id, STRIPE_PAYGATE_ALIAS)
    if (existing != null && existing.deletedAt == null) {
      await resource.update({ ...existing, deletedAt: new Date() })
    }
  }

  const settle = async (session: Stripe.Checkout.Session, outcome: CheckoutOutcome, entityId?: string): Promise<void> => {
    const metadata = session.metadata ?? {}
    const owner = entityId ?? metadata.entityId
    if (owner == null) return
    const amount = Number(metadata.amountMinor)
    await checkoutPluginsOf(ctx).settleCheckout(registeredPlugins(), paymentUtils.compact({
      entityId: owner, productSku: metadata.productSku, planSku: metadata.planSku, sessionId: session.id, outcome,
      amountMinor: Number.isSafeInteger(amount) && amount > 0 ? amount : undefined, at: new Date(),
    }))
  }

  const fulfillPayment = async (session: Stripe.Checkout.Session): Promise<void> => {
    if (session.mode === 'subscription') {
      await completeSubscriptionCheckout(session)
      return
    }
    if (session.mode !== 'payment' || session.payment_status !== 'paid') return
    const metadata = session.metadata ?? {}
    if (metadata.entityId == null || metadata.service == null || metadata.productSku == null) {
      throw new PaygateError('metadata:owner')
    }
    await customerLockHelper.withCustomerLock(paymentUtils.idOf(session.customer), async () => {
      const ledger = access.fulfillments()
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

      // The purchase — the withdrawal window and the contract — exists BEFORE the credits do; the
      // billing country is locked with it.
      const captured = await captureOf(ctx).capturePaymentPurchase(stripe, session, paymentUtils.compact({
        netAmountMinor: completion.mode === 'amount' ? completion.amountMinor : undefined,
        amountCurrency: completion.mode === 'amount' ? completion.amountCurrency : undefined,
        units: completion.mode === 'quantity' ? completion.units : undefined,
      }))
      const evidence = captureOf(ctx).sessionEvidenceOf(session)
      const identifiers = paymentUtils.compact({
        paymentIntentId: paymentUtils.idOf(session.payment_intent), invoiceId: paymentUtils.idOf(session.invoice),
      })
      const evidenceFields = paymentUtils.compact({
        country: evidence.country, email: evidence.email, profileId: metadata.profileId,
        amountTotalMinor: session.amount_total ?? undefined, amountTaxMinor: session.total_details?.amount_tax ?? undefined,
        termsAccepted: evidence.termsAccepted, purchaseId: captured?.purchase.purchaseId,
      })
      if (stored == null) {
        try {
          stored = await ledger.create(paymentUtils.compact({ ...base, ...record, ...identifiers, ...evidenceFields, createdAt: new Date() }) as PaymentFulfillmentRecord)
        } catch (error) {
          if (!paymentUtils.isDuplicateKey(error)) throw error
          stored = await ledger.byExternalId(session.id, STRIPE_PAYGATE_ALIAS)
          if (stored == null || stored.fulfilledAt != null) return
        }
      } else if ((stored.paymentIntentId == null && identifiers.paymentIntentId != null)
        || (stored.purchaseId == null && evidenceFields.purchaseId != null)) {
        stored = await ledger.update({ ...stored, ...identifiers, ...evidenceFields })
      }
      await access.observer().propagateTopUp(completion, ctx)
      await ledger.update({ ...stored, fulfilledAt: new Date() })
      log.info('Top-up fulfilled', paymentUtils.compact({
        entityId: base.entityId, productSku: base.productSku, planSku: base.planSku, sessionId: session.id,
        purchaseId: captured?.purchase.purchaseId, ...record,
      }), { event: 'payment.topup' })
    })
    await settle(session, 'paid')
  }

  /**
   * A completed SUBSCRIPTION checkout: the subscription is applied if no webhook applied it yet
   * (its first commit writes the purchase before the `created` observers), then the purchase is
   * refined with the buyer's own country and totals, the billing country is locked, the evidence is
   * stored on the subscription row and the confirmation mailed.
   */
  const completeSubscriptionCheckout = async (session: Stripe.Checkout.Session): Promise<void> => {
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return
    const subscriptionId = paymentUtils.idOf(session.subscription)
    if (subscriptionId == null) return
    await customerLockHelper.withCustomerLock(paymentUtils.idOf(session.customer), async () => {
      let row = await access.subscriptions().byExternalId(subscriptionId, STRIPE_PAYGATE_ALIAS)
      let subscription: Stripe.Subscription | null = null
      if (row?.propagated == null) {
        subscription = await stripeSubscriptions.retrieveSubscription(stripe, subscriptionId)
        if (subscription != null) {
          row = (await stripeSubscriptions.applySubscription(subscription, { source: 'webhook', stripe })).record ?? row
        }
      }
      if (row == null) {
        log.warn('Completed checkout names an unknown subscription', { sessionId: session.id, subscriptionId })
        return
      }
      let purchase = await access.purchases().byPurchaseId(consumerRecordsOf(ctx).purchaseIdOf(subscriptionId))
      if (purchase == null && ENTITLING_STATUSES.includes(row.status)) {
        subscription = subscription ?? await stripeSubscriptions.retrieveSubscription(stripe, subscriptionId)
        purchase = subscription != null
          ? (await captureOf(ctx).captureSubscriptionPurchase(stripe, subscription, row))?.purchase ?? null : null
      }
      if (purchase != null) {
        purchase = await captureOf(ctx).completeSubscriptionPurchase(stripe, session, purchase)
      }
      const evidence = captureOf(ctx).sessionEvidenceOf(session)
      const metadata = session.metadata ?? {}
      const current = await access.subscriptions().byExternalId(subscriptionId, STRIPE_PAYGATE_ALIAS) ?? row
      await access.subscriptions().update(paymentUtils.compact({
        ...current,
        checkoutSessionId: session.id,
        purchaseId: purchase?.purchaseId ?? current.purchaseId,
        firstInvoiceId: current.firstInvoiceId ?? paymentUtils.idOf(session.invoice),
        currency: current.currency ?? (evidence.currency !== '' ? evidence.currency : undefined),
        country: evidence.country ?? current.country,
        email: evidence.email ?? current.email,
        amountTotalMinor: evidence.totalMinor,
        amountTaxMinor: evidence.taxMinor,
        termsAccepted: evidence.termsAccepted ?? current.termsAccepted,
        startRequestId: metadata.startRequestId ?? purchase?.startRequestId ?? current.startRequestId,
      }))
      log.info('Subscription checkout completed', paymentUtils.compact({
        entityId: current.entityId, sessionId: session.id, subscriptionId, planSku: current.planSku,
        purchaseId: purchase?.purchaseId, amountTotalMinor: evidence.totalMinor,
        currency: current.currency ?? (evidence.currency !== '' ? evidence.currency : undefined),
      }), { event: 'checkout.completed' })
    })
    await settle(session, 'paid')
  }

  const checkoutFailed = async (session: Stripe.Checkout.Session): Promise<void> => {
    const metadata = session.metadata ?? {}
    const customerId = paymentUtils.idOf(session.customer)
    const entityId = metadata.entityId
      ?? (customerId != null ? (await access.paygateCustomers().loadByPgId(customerId, STRIPE_PAYGATE_ALIAS))?.entityId : undefined)
    if (entityId == null) {
      log.warn('Failed checkout belongs to no known entity', { sessionId: session.id })
      return
    }
    if (session.mode === 'payment' && metadata.productSku != null && metadata.service != null) {
      const ledger = access.fulfillments()
      const stored = await ledger.byExternalId(session.id, STRIPE_PAYGATE_ALIAS)
      if (stored == null) {
        try {
          await ledger.create(paymentUtils.compact({
            entityId, productSku: metadata.productSku, planSku: metadata.planSku, service: metadata.service,
            paygate: STRIPE_PAYGATE_ALIAS, externalId: session.id,
            mode: metadata.pricingMode === CheckoutPricingMode.Amount ? CheckoutPricingMode.Amount : CheckoutPricingMode.Quantity,
            paymentIntentId: paymentUtils.idOf(session.payment_intent), createdAt: new Date(), failedAt: new Date(),
          }) as PaymentFulfillmentRecord)
        } catch (error) {
          if (!paymentUtils.isDuplicateKey(error)) throw error
        }
      } else if (stored.failedAt == null && stored.fulfilledAt == null) {
        await ledger.update({ ...stored, failedAt: new Date() })
      }
    }
    await access.observer().propagatePaymentFailed(paymentUtils.compact({
      entityId, kind: 'checkout' as const, externalId: session.id,
      subscriptionId: paymentUtils.idOf(session.subscription), eventKey: `payment-failed:${session.id}:0`,
    }), ctx)
    log.info('Payment failed', paymentUtils.compact({
      entityId, kind: 'checkout', sessionId: session.id, subscriptionId: paymentUtils.idOf(session.subscription),
    }), { event: 'payment.failed' })
    await settle(session, 'failed', entityId)
  }

  const purgeExpiredCheckout = async (session: Stripe.Checkout.Session): Promise<void> => {
    await access.fulfillments().purge({ paygate: STRIPE_PAYGATE_ALIAS, externalId: session.id, fulfilledAt: null })
    await settle(session, 'expired')
  }

  const applyFromEvent = (opts: Partial<ApplyOptions> = {}): EventHandler => async event => {
    const subscription = event.data.object as Stripe.Subscription
    await customerLockHelper.withCustomerLock(paymentUtils.idOf(subscription.customer), async () => {
      await stripeSubscriptions.applySubscription(subscription, {
        source: 'webhook', eventId: event.id, eventCreated: event.created, stripe, ...opts,
      })
    })
  }

  const reapplyInvoiceSubscription = async (
    event: Stripe.Event, invoice: Stripe.Invoice, opts: Partial<ApplyOptions> = {},
  ): Promise<CommitResult | null> => {
    const subscriptionId = subscriptionIdOfInvoice(invoice)
    if (subscriptionId == null) return null
    const subscription = await stripeSubscriptions.retrieveSubscription(stripe, subscriptionId)
    if (subscription == null) {
      return await customerLockHelper.withCustomerLock(paymentUtils.idOf(invoice.customer),
        async () => await stripeSubscriptions.cancelMissing(subscriptionId))
    }

    return await customerLockHelper.withCustomerLock(paymentUtils.idOf(subscription.customer), async () =>
      await stripeSubscriptions.applySubscription(subscription, { source: 'webhook', eventId: event.id, stripe, ...opts }))
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
    await customerLockHelper.withCustomerLock(paymentUtils.idOf(invoice.customer), async () => {
      const row = await access.subscriptions().byExternalId(subscriptionId, STRIPE_PAYGATE_ALIAS)
      if (row == null) return
      let latest = latestInvoiceId
      if (latest == null) {
        const subscription = await stripeSubscriptions.retrieveSubscription(stripe, subscriptionId)
        latest = paymentUtils.idOf(subscription?.latest_invoice)
      }
      if (latest != null && row.latestInvoiceId !== latest) {
        await access.subscriptions().update({ ...row, latestInvoiceId: latest, updatedAt: new Date() })
      }
    })
  }

  const invoiceFailed: EventHandler = async event => {
    const invoice = event.data.object as Stripe.Invoice
    const result = await reapplyInvoiceSubscription(event, invoice)
    const customerId = paymentUtils.idOf(invoice.customer)
    const entityId = result?.record?.entityId
      ?? (customerId != null ? (await access.paygateCustomers().loadByPgId(customerId, STRIPE_PAYGATE_ALIAS))?.entityId : undefined)
    if (entityId == null) {
      log.warn('Failed invoice belongs to no known entity', { invoiceId: invoice.id })
      return
    }
    const attempt = invoice.attempt_count ?? 0
    await access.observer().propagatePaymentFailed(paymentUtils.compact({
      entityId, kind: 'invoice' as const, externalId: invoice.id, subscriptionId: subscriptionIdOfInvoice(invoice),
      invoiceId: invoice.id, attempt, actionRequired: event.type === 'invoice.payment_action_required',
      nextAttemptAt: paymentUtils.dateOf(invoice.next_payment_attempt), eventKey: `payment-failed:${invoice.id}:${attempt}`,
    }), ctx)
    log.info('Payment failed', paymentUtils.compact({
      entityId, kind: 'invoice', invoiceId: invoice.id, subscriptionId: subscriptionIdOfInvoice(invoice), attempt,
      actionRequired: event.type === 'invoice.payment_action_required',
    }), { event: 'payment.failed' })
  }

  const targetFields = (target: PaymentTarget) => target.kind === 'fulfillment'
    ? paymentUtils.compact({
      entityId: target.record.entityId, target: target.kind, productSku: target.record.productSku,
      planSku: target.record.planSku ?? undefined, externalId: target.record.externalId,
      netAmountMinor: target.record.amountMinor ?? undefined,
      chargeAmountMinor: target.record.chargeAmountMinor ?? undefined,
    })
    : paymentUtils.compact({
      entityId: target.record.entityId, target: target.kind, productSku: target.record.productSku,
      planSku: target.record.planSku, externalId: target.record.externalId,
    })

  /** A refund of a purchase's payment moves its refunded total; a whole refund closes its window. */
  const refundPurchase = async (target: PaymentTarget, refundedTotal: number, paid: number | undefined): Promise<void> => {
    const purchaseId = consumerRecordsOf(ctx).purchaseIdOf(target.record.externalId)
    const purchase = await access.purchases().byPurchaseId(purchaseId)
    if (purchase == null || (target.kind === 'subscription' && purchase.invoiceId != null && purchase.invoiceId !== target.invoiceId)) {
      return
    }
    await consumerRecordsOf(ctx).patchPurchase(purchaseId, paymentUtils.compact({
      refundedMinor: Math.max(purchase.refundedMinor ?? 0, refundedTotal),
      refundedAt: purchase.refundedAt ?? (paid != null && refundedTotal >= paid ? new Date() : undefined),
    }))
  }

  const processRefund = async (refund: Stripe.Refund, charge?: Stripe.Charge | null): Promise<void> => {
    if (refund.status !== 'succeeded') return
    const target = await paymentTargetOf(ctx).resolvePaymentTarget(stripe, {
      paymentIntentId: paymentUtils.idOf(refund.payment_intent), chargeId: paymentUtils.idOf(refund.charge), charge,
    })
    if (target == null) {
      log.warn('Refund matches no fulfillment or subscription', { refundId: refund.id })
      return
    }
    const chargeId = paymentUtils.idOf(refund.charge)
    const refunded = target.charge ?? (chargeId != null ? await paymentTargetOf(ctx).retrieveCharge(stripe, chargeId) : null)
    const refundedTotal = Math.max(refunded?.amount_refunded ?? 0, refund.amount)
    const paid = refunded?.amount
    if (target.kind === 'fulfillment') {
      await access.fulfillments().update(paymentUtils.compact({
        ...target.record, refundedMinor: Math.max(target.record.refundedMinor ?? 0, refundedTotal),
        refundedAt: new Date(), chargeId: target.record.chargeId ?? refunded?.id,
      }))
    }
    await refundPurchase(target, refundedTotal, paid)
    const metadata = { ...(refund.metadata ?? {}) } as Record<string, string>
    await access.observer().propagateRefund(paymentUtils.compact({
      ...targetFields(target),
      refundId: refund.id,
      paymentIntentId: target.paymentIntentId ?? paymentUtils.idOf(refund.payment_intent),
      invoiceId: target.kind === 'subscription' ? target.invoiceId : target.record.invoiceId ?? undefined,
      amountMinor: refund.amount,
      refundedTotalMinor: refundedTotal,
      paidMinor: paid,
      currency: refund.currency,
      partial: paid != null ? refundedTotal < paid : false,
      eventKey: `refund:${refund.id}`,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      // Set by a withdrawal's own refund: its observer takes back the unused units, `onRefund` must not.
      withdrawalId: metadata.withdrawalId != null && metadata.withdrawalId !== '' ? metadata.withdrawalId : undefined,
    }) as RefundEvent, ctx)
    log.info('Payment refunded', paymentUtils.compact({
      entityId: target.record.entityId, target: target.kind, externalId: target.record.externalId, refundId: refund.id,
      amountMinor: refund.amount, refundedTotalMinor: refundedTotal, paidMinor: paid, currency: refund.currency,
      withdrawalId: metadata.withdrawalId != null && metadata.withdrawalId !== '' ? metadata.withdrawalId : undefined,
    }), { event: 'payment.refunded' })
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
    const target = await paymentTargetOf(ctx).resolvePaymentTarget(stripe, {
      paymentIntentId: paymentUtils.idOf(dispute.payment_intent), chargeId: paymentUtils.idOf(dispute.charge),
    })
    if (target == null) {
      log.warn('Dispute matches no fulfillment or subscription', { disputeId: dispute.id })
      return
    }
    const marks = { disputedAt: target.record.disputedAt ?? new Date(), disputeStatus: dispute.status }
    if (target.kind === 'fulfillment') {
      await access.fulfillments().update({ ...target.record, ...marks })
    } else {
      await access.subscriptions().update({ ...(target.record as PaymentSubscriptionRecord), ...marks })
    }
    await access.observer().propagateDispute(paymentUtils.compact({
      ...targetFields(target), disputeId: dispute.id, phase, status: dispute.status,
      amountMinor: dispute.amount, currency: dispute.currency, eventKey: `dispute:${dispute.id}:${phase}`,
    }) as DisputeEvent, ctx)
    log.info('Dispute changed', paymentUtils.compact({
      entityId: target.record.entityId, target: target.kind, externalId: target.record.externalId,
      disputeId: dispute.id, phase, status: dispute.status, amountMinor: dispute.amount, currency: dispute.currency,
    }), { event: phase === 'opened' ? 'dispute.opened' : phase === 'closed' ? 'dispute.closed' : 'dispute.updated' })
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
