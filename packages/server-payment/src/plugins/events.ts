import { CheckoutPricingMode, ENTITLING_STATUSES, PaygateError, SubscriptionStatus } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import { GATEWAY_SERVICE } from '../consts.js'
import type {
  CommitResult, CheckoutOutcome, CheckoutPlugin, DisputeEvent, PaymentFulfillmentRecord, PaymentSubscriptionRecord,
  RefundEvent, TopUpCompletion,
} from '../types.js'
import type {
  CheckoutSnapshot, DisputeChangedEvent, EventCustomer, EventInvoice, InvoiceEvent, Paygate, PaygateCharge,
  PaygateEvent, PaygateRefund, PaygateSubscription, SubscriptionChangedEvent,
} from '../paygate/types.js'
import type { PaymentTarget } from './refunds/types.js'
import type { ApplyOptions } from './subscriptions/types.js'
import { log } from '../log.js'
import type { PaymentEventsHelper } from './events/types.js'
import { paymentAccessOf } from '../access.js'
import { paymentUtils } from '../utils.js'
import { checkoutPluginsOf } from './checkout-plugins.js'
import { paymentTargetOf } from './refunds.js'
import { customerLockHelper } from './customer-lock.js'
import { paygateSubscriptionsOf } from './subscriptions.js'
import { checkoutSnapshotHelper } from './snapshot.js'
import { consumerRecordsOf } from '../consumer/records.js'
import { captureOf } from '../consumer/capture.js'

const integerMetadata = (metadata: Record<string, string>, key: string): number => {
  const raw = metadata[key]
  const value = raw == null || raw.trim() === '' ? Number.NaN : Number(raw)
  if (!Number.isSafeInteger(value)) throw new PaygateError(`metadata:${key}`)
  return value
}

/**
 * The event dispatch of a context: one paygate event applied to the stores and told to the
 * observers. A throw escapes so the paygate delivers the event again.
 */
export const makePaymentEventsHelper = (ctx: ApiContext): PaymentEventsHelper => {
  const access = paymentAccessOf(ctx)
  const subscriptions = paygateSubscriptionsOf(ctx)
  const lock = customerLockHelper.withCustomerLock

  /** The registered checkout plugins — none in a context without a gateway service. */
  const registeredPlugins = (): readonly CheckoutPlugin[] =>
    (ctx as unknown as { hasService?: (alias: string) => boolean }).hasService?.(GATEWAY_SERVICE) === true
      ? access.gateway().checkoutPlugins?.() ?? [] : []

  const upsertCustomer = async (paygate: Paygate, customer: EventCustomer): Promise<void> => {
    await lock(paygate.id, customer.id, async () => {
      const resource = access.paygateCustomers()
      const existing = await resource.loadByPgId(customer.id, paygate.id)
      const data = paymentUtils.compact({
        email: customer.email ?? undefined, name: customer.name ?? undefined,
        taxId: customer.taxId ?? undefined,
        country: customer.country?.toUpperCase() ?? undefined,
        currency: customer.currency?.toLowerCase() ?? undefined,
        entityId: customer.metadata?.entityId ?? existing?.entityId ?? undefined,
        profileId: customer.metadata?.profileId ?? existing?.profileId ?? undefined,
      })
      if (existing == null) {
        try {
          await resource.create({ paygate: paygate.id, externalId: customer.id, ...data })
        } catch (error) {
          if (!paymentUtils.isDuplicateKey(error)) throw error
        }
      } else {
        const { deletedAt: _deleted, ...kept } = existing
        await resource.update({ ...kept, ...data })
      }
    })
  }

  const markCustomerDeleted = async (paygate: Paygate, customerId: string): Promise<void> => {
    const resource = access.paygateCustomers()
    const existing = await resource.loadByPgId(customerId, paygate.id)
    if (existing != null && existing.deletedAt == null) {
      await resource.update({ ...existing, deletedAt: new Date() })
    }
  }

  const settle = async (session: CheckoutSnapshot, outcome: CheckoutOutcome, entityId?: string): Promise<void> => {
    const metadata = session.metadata ?? {}
    const owner = entityId ?? metadata.entityId
    if (owner == null) return
    const amount = Number(metadata.amountMinor)
    await checkoutPluginsOf(ctx).settleCheckout(registeredPlugins(), paymentUtils.compact({
      entityId: owner, productSku: metadata.productSku, planSku: metadata.planSku, sessionId: session.id, outcome,
      amountMinor: Number.isSafeInteger(amount) && amount > 0 ? amount : undefined, at: new Date(),
    }))
  }

  const fulfillPayment = async (paygate: Paygate, session: CheckoutSnapshot): Promise<void> => {
    if (session.mode === 'subscription') {
      await completeSubscriptionCheckout(paygate, session)
      return
    }
    if (!checkoutSnapshotHelper.canFulfill(session)) return
    const metadata = session.metadata ?? {}
    if (metadata.entityId == null || metadata.service == null || metadata.productSku == null) {
      throw new PaygateError('metadata:owner')
    }
    await lock(paygate.id, session.customerId, async () => {
      const ledger = access.fulfillments()
      let stored = await ledger.byExternalId(session.id, paygate.id)
      if (stored?.fulfilledAt != null) return

      const amountMode = metadata.pricingMode === CheckoutPricingMode.Amount
      const base = {
        entityId: metadata.entityId, productSku: metadata.productSku, planSku: metadata.planSku,
        service: metadata.service, paygate: paygate.id, externalId: session.id,
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
          || amountCurrency == null || session.amountSubtotalMinor !== chargedMinor
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
        const units = await paygate.checkout.units(session.id)
        if (units <= 0) throw new PaygateError('units')
        record = { mode: CheckoutPricingMode.Quantity, units, ...(session.currency != null ? { currency: session.currency } : {}) }
        completion = { ...base, mode: 'quantity', units }
      }

      // The purchase — the withdrawal window and the contract — exists BEFORE the credits do; the
      // billing country is locked with it.
      const captured = await captureOf(ctx).capturePaymentPurchase(paygate, session, paymentUtils.compact({
        netAmountMinor: completion.mode === 'amount' ? completion.amountMinor : undefined,
        amountCurrency: completion.mode === 'amount' ? completion.amountCurrency : undefined,
        units: completion.mode === 'quantity' ? completion.units : undefined,
      }))
      const evidence = captureOf(ctx).sessionEvidenceOf(session)
      const identifiers = paymentUtils.compact({ paymentIntentId: session.paymentId, invoiceId: session.invoiceId })
      const evidenceFields = paymentUtils.compact({
        country: evidence.country, email: evidence.email, profileId: metadata.profileId,
        amountTotalMinor: session.amountTotalMinor ?? undefined, amountTaxMinor: session.amountTaxMinor ?? undefined,
        termsAccepted: evidence.termsAccepted, purchaseId: captured?.purchase.purchaseId,
      })
      if (stored == null) {
        try {
          stored = await ledger.create(paymentUtils.compact({ ...base, ...record, ...identifiers, ...evidenceFields, createdAt: new Date() }) as PaymentFulfillmentRecord)
        } catch (error) {
          if (!paymentUtils.isDuplicateKey(error)) throw error
          stored = await ledger.byExternalId(session.id, paygate.id)
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
  const completeSubscriptionCheckout = async (paygate: Paygate, session: CheckoutSnapshot): Promise<void> => {
    if (session.payment !== 'paid' && session.payment !== 'not-required') return
    const subscriptionId = session.subscriptionId
    if (subscriptionId == null) return
    await lock(paygate.id, session.customerId, async () => {
      let row = await access.subscriptions().byExternalId(subscriptionId, paygate.id)
      let subscription: PaygateSubscription | null = null
      if (row?.propagated == null) {
        subscription = await subscriptions.retrieveSubscription(paygate, subscriptionId)
        if (subscription != null) {
          row = (await subscriptions.applySubscription(paygate, subscription, { source: 'webhook' })).record ?? row
        }
      }
      if (row == null) {
        log.warn('Completed checkout names an unknown subscription', { sessionId: session.id, subscriptionId })
        return
      }
      let purchase = await access.purchases().byPurchaseId(consumerRecordsOf(ctx).purchaseIdOf(paygate.id, subscriptionId))
      if (purchase == null && ENTITLING_STATUSES.includes(row.status)) {
        subscription = subscription ?? await subscriptions.retrieveSubscription(paygate, subscriptionId)
        purchase = subscription != null
          ? (await captureOf(ctx).captureSubscriptionPurchase(paygate, subscription, row))?.purchase ?? null : null
      }
      if (purchase != null) {
        purchase = await captureOf(ctx).completeSubscriptionPurchase(paygate, session, purchase)
      }
      const evidence = captureOf(ctx).sessionEvidenceOf(session)
      const metadata = session.metadata ?? {}
      const current = await access.subscriptions().byExternalId(subscriptionId, paygate.id) ?? row
      await access.subscriptions().update(paymentUtils.compact({
        ...current,
        checkoutSessionId: session.id,
        purchaseId: purchase?.purchaseId ?? current.purchaseId,
        firstInvoiceId: current.firstInvoiceId ?? session.invoiceId,
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

  const checkoutFailed = async (paygate: Paygate, session: CheckoutSnapshot): Promise<void> => {
    const metadata = session.metadata ?? {}
    const customerId = session.customerId
    const entityId = metadata.entityId
      ?? (customerId != null ? (await access.paygateCustomers().loadByPgId(customerId, paygate.id))?.entityId : undefined)
    if (entityId == null) {
      log.warn('Failed checkout belongs to no known entity', { sessionId: session.id })
      return
    }
    if (session.mode === 'payment' && metadata.productSku != null && metadata.service != null) {
      const ledger = access.fulfillments()
      const stored = await ledger.byExternalId(session.id, paygate.id)
      if (stored == null) {
        try {
          await ledger.create(paymentUtils.compact({
            entityId, productSku: metadata.productSku, planSku: metadata.planSku, service: metadata.service,
            paygate: paygate.id, externalId: session.id,
            mode: metadata.pricingMode === CheckoutPricingMode.Amount ? CheckoutPricingMode.Amount : CheckoutPricingMode.Quantity,
            paymentIntentId: session.paymentId, createdAt: new Date(), failedAt: new Date(),
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
      subscriptionId: session.subscriptionId, eventKey: `payment-failed:${session.id}:0`,
    }), ctx)
    log.info('Payment failed', paymentUtils.compact({
      entityId, kind: 'checkout', sessionId: session.id, subscriptionId: session.subscriptionId,
    }), { event: 'payment.failed' })
    await settle(session, 'failed', entityId)
  }

  const purgeExpiredCheckout = async (paygate: Paygate, session: CheckoutSnapshot): Promise<void> => {
    await access.fulfillments().purge({ paygate: paygate.id, externalId: session.id, fulfilledAt: null })
    await settle(session, 'expired')
  }

  const subscriptionChanged = async (paygate: Paygate, event: SubscriptionChangedEvent): Promise<void> => {
    const subscription = event.subscription
    await lock(paygate.id, subscription.customerId, async () => {
      await subscriptions.applySubscription(paygate, subscription, {
        source: 'webhook', eventId: event.eventId, eventCreated: event.createdAt,
        ...(event.deleted ? { forced: SubscriptionStatus.Canceled } : {}),
        ...(event.trialEnding ? { trialEnding: true } : {}),
      })
    })
  }

  const reapplyInvoiceSubscription = async (
    paygate: Paygate, eventId: string, invoice: EventInvoice, opts: Partial<ApplyOptions> = {},
  ): Promise<CommitResult | null> => {
    const subscriptionId = invoice.subscriptionId
    if (subscriptionId == null || paygate.subscriptions == null) return null
    const subscription = await subscriptions.retrieveSubscription(paygate, subscriptionId)
    if (subscription == null) {
      return await lock(paygate.id, invoice.customerId, async () => await subscriptions.cancelMissing(paygate, subscriptionId))
    }

    return await lock(paygate.id, subscription.customerId, async () =>
      await subscriptions.applySubscription(paygate, subscription, { source: 'webhook', eventId, ...opts }))
  }

  const refreshLatestInvoice = async (paygate: Paygate, invoice: EventInvoice, latestInvoiceId?: string): Promise<void> => {
    const subscriptionId = invoice.subscriptionId
    if (subscriptionId == null) return
    await lock(paygate.id, invoice.customerId, async () => {
      const row = await access.subscriptions().byExternalId(subscriptionId, paygate.id)
      if (row == null) return
      let latest = latestInvoiceId
      if (latest == null) {
        const subscription = await subscriptions.retrieveSubscription(paygate, subscriptionId)
        latest = subscription?.latestInvoiceId
      }
      if (latest != null && row.latestInvoiceId !== latest) {
        await access.subscriptions().update({ ...row, latestInvoiceId: latest, updatedAt: new Date() })
      }
    })
  }

  const invoiceFailed = async (paygate: Paygate, event: InvoiceEvent): Promise<void> => {
    const invoice = event.invoice
    const result = await reapplyInvoiceSubscription(paygate, event.eventId, invoice)
    const customerId = invoice.customerId
    const entityId = result?.record?.entityId
      ?? (customerId != null ? (await access.paygateCustomers().loadByPgId(customerId, paygate.id))?.entityId : undefined)
    if (entityId == null) {
      log.warn('Failed invoice belongs to no known entity', { invoiceId: invoice.id })
      return
    }
    const attempt = invoice.attempt ?? 0
    const actionRequired = event.change === 'action-required'
    await access.observer().propagatePaymentFailed(paymentUtils.compact({
      entityId, kind: 'invoice' as const, externalId: invoice.id, subscriptionId: invoice.subscriptionId,
      invoiceId: invoice.id, attempt, actionRequired,
      nextAttemptAt: invoice.nextAttemptAt, eventKey: `payment-failed:${invoice.id}:${attempt}`,
    }), ctx)
    log.info('Payment failed', paymentUtils.compact({
      entityId, kind: 'invoice', invoiceId: invoice.id, subscriptionId: invoice.subscriptionId, attempt, actionRequired,
    }), { event: 'payment.failed' })
  }

  const invoiceChanged = async (paygate: Paygate, event: InvoiceEvent): Promise<void> => {
    const invoice = event.invoice
    switch (event.change) {
      case 'paid':
        if (invoice.renewal) {
          await reapplyInvoiceSubscription(paygate, event.eventId, invoice, { renewal: true, invoiceId: invoice.id })
          return
        }
        await refreshLatestInvoice(paygate, invoice, invoice.id)
        return
      case 'payment-failed':
      case 'action-required':
        await invoiceFailed(paygate, event)
        return
      case 'uncollectible':
        await reapplyInvoiceSubscription(paygate, event.eventId, invoice)
        return
      case 'voided':
        await refreshLatestInvoice(paygate, invoice)
    }
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
  const refundPurchase = async (
    paygate: Paygate, target: PaymentTarget, refundedTotal: number, paid: number | undefined,
  ): Promise<void> => {
    const purchaseId = consumerRecordsOf(ctx).purchaseIdOf(paygate.id, target.record.externalId)
    const purchase = await access.purchases().byPurchaseId(purchaseId)
    if (purchase == null || (target.kind === 'subscription' && purchase.invoiceId != null && purchase.invoiceId !== target.invoiceId)) {
      return
    }
    await consumerRecordsOf(ctx).patchPurchase(purchaseId, paymentUtils.compact({
      refundedMinor: Math.max(purchase.refundedMinor ?? 0, refundedTotal),
      refundedAt: purchase.refundedAt ?? (paid != null && refundedTotal >= paid ? new Date() : undefined),
    }))
  }

  const processRefund = async (paygate: Paygate, refund: PaygateRefund, charge?: PaygateCharge | null): Promise<void> => {
    if (!refund.succeeded) return
    const target = await paymentTargetOf(ctx).resolvePaymentTarget(paygate, {
      paymentIntentId: refund.paymentId, chargeId: refund.chargeId, charge,
    })
    if (target == null) {
      log.warn('Refund matches no fulfillment or subscription', { refundId: refund.id })
      return
    }
    const chargeId = refund.chargeId
    const refunded = target.charge ?? (chargeId != null ? await paymentTargetOf(ctx).retrieveCharge(paygate, chargeId) : null)
    const refundedTotal = Math.max(refunded?.refundedMinor ?? 0, refund.amountMinor)
    const paid = refunded?.amountMinor
    if (target.kind === 'fulfillment') {
      await access.fulfillments().update(paymentUtils.compact({
        ...target.record, refundedMinor: Math.max(target.record.refundedMinor ?? 0, refundedTotal),
        refundedAt: new Date(), chargeId: target.record.chargeId ?? refunded?.id,
      }))
    }
    await refundPurchase(paygate, target, refundedTotal, paid)
    const metadata = { ...(refund.metadata ?? {}) } as Record<string, string>
    await access.observer().propagateRefund(paymentUtils.compact({
      ...targetFields(target),
      refundId: refund.id,
      paymentIntentId: target.paymentIntentId ?? refund.paymentId,
      invoiceId: target.kind === 'subscription' ? target.invoiceId : target.record.invoiceId ?? undefined,
      amountMinor: refund.amountMinor,
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
      amountMinor: refund.amountMinor, refundedTotalMinor: refundedTotal, paidMinor: paid, currency: refund.currency,
      withdrawalId: metadata.withdrawalId != null && metadata.withdrawalId !== '' ? metadata.withdrawalId : undefined,
    }), { event: 'payment.refunded' })
  }

  const disputeChanged = async (paygate: Paygate, event: DisputeChangedEvent): Promise<void> => {
    const { dispute, phase } = event
    const target = await paymentTargetOf(ctx).resolvePaymentTarget(paygate, {
      paymentIntentId: dispute.paymentId, chargeId: dispute.chargeId,
    })
    if (target == null) {
      log.warn('Dispute matches no fulfillment or subscription', { disputeId: dispute.id })
      return
    }
    const chargeId = dispute.chargeId
    const charge = target.charge ?? (chargeId != null ? await paymentTargetOf(ctx).retrieveCharge(paygate, chargeId) : null)
    const marks = { disputedAt: target.record.disputedAt ?? new Date(), disputeStatus: dispute.status }
    if (target.kind === 'fulfillment') {
      await access.fulfillments().update({ ...target.record, ...marks })
    } else {
      await access.subscriptions().update({ ...(target.record as PaymentSubscriptionRecord), ...marks })
    }
    await access.observer().propagateDispute(paymentUtils.compact({
      ...targetFields(target), disputeId: dispute.id, phase, status: dispute.status,
      amountMinor: dispute.amountMinor, paidMinor: charge?.amountMinor, currency: dispute.currency,
      eventKey: `dispute:${dispute.id}:${phase}`,
    }) as DisputeEvent, ctx)
    log.info('Dispute changed', paymentUtils.compact({
      entityId: target.record.entityId, target: target.kind, externalId: target.record.externalId,
      disputeId: dispute.id, phase, status: dispute.status, amountMinor: dispute.amountMinor, currency: dispute.currency,
    }), { event: phase === 'opened' ? 'dispute.opened' : phase === 'closed' ? 'dispute.closed' : 'dispute.updated' })
  }

  const apply = async (paygate: Paygate, event: PaygateEvent): Promise<void> => {
    switch (event.type) {
      case 'customer':
        if (event.change === 'deleted') {
          await markCustomerDeleted(paygate, event.customer.id)
        } else {
          await upsertCustomer(paygate, event.customer)
        }
        return
      case 'checkout':
        if (event.outcome === 'completed') {
          await fulfillPayment(paygate, event.session)
        } else if (event.outcome === 'failed') {
          await checkoutFailed(paygate, event.session)
        } else {
          await purgeExpiredCheckout(paygate, event.session)
        }
        return
      case 'subscription':
        await subscriptionChanged(paygate, event)
        return
      case 'invoice':
        await invoiceChanged(paygate, event)
        return
      case 'refund':
        await processRefund(paygate, event.refund, event.charge)
        return
      case 'dispute':
        await disputeChanged(paygate, event)
    }
  }

  return { apply }
}

/** The paygate event dispatch of a context — one per context. */
export const paymentEventsOf = memoHelper.oncePer(makePaymentEventsHelper)
