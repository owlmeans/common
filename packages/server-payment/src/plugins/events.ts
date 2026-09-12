import type Stripe from 'stripe'
import { Mutex } from 'async-mutex'
import {
  CheckoutPricingMode, PaygateError, PlanDuration, SubscriptionStatus,
} from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { STRIPE_PAYGATE_ALIAS } from '../consts.js'
import { observer, payment, paygateCustomers, subscriptions } from '../utils.js'
import type { PaymentPlan, PaymentSubscriptionRecord, TopUpCompletion } from '../types.js'

const customerMutex: Record<string, Mutex> = {}
const lockOn = async (customerId: string) => {
  customerMutex[customerId] = customerMutex[customerId] ?? new Mutex()
  return customerMutex[customerId].acquire()
}
const unlockOn = (customerId: string) => {
  const mutex = customerMutex[customerId]
  if (mutex != null) {
    mutex.release()
    if (!mutex.isLocked()) delete customerMutex[customerId]
  }
}
const customerIdOf = (value: string | { id?: string } | null): string =>
  typeof value === 'string' ? value : (value?.id ?? '')
const mapStatus = (status: Stripe.Subscription.Status): SubscriptionStatus => {
  switch (status) {
    case 'active': return SubscriptionStatus.Active
    case 'trialing': return SubscriptionStatus.Trial
    case 'past_due':
    case 'unpaid': return SubscriptionStatus.Expired
    case 'canceled': return SubscriptionStatus.Canceled
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused': return SubscriptionStatus.Suspended
    default: return SubscriptionStatus.Created
  }
}
const integerMetadata = (metadata: Stripe.Metadata, key: string): number => {
  const raw = metadata[key]
  const value = raw == null || raw.trim() === '' ? Number.NaN : Number(raw)
  if (!Number.isSafeInteger(value)) throw new PaygateError(`metadata:${key}`)
  return value
}

export const createEventHandler = (context: ApiContext, stripe: Stripe) => {
  const fulfillPayment = async (session: Stripe.Checkout.Session): Promise<void> => {
    if (session.mode !== 'payment' || session.payment_status !== 'paid') return
    const metadata = session.metadata ?? {}
    if (metadata.entityId == null || metadata.service == null || metadata.productSku == null) {
      throw new PaygateError('metadata:owner')
    }
    const customerId = customerIdOf(session.customer)
    await lockOn(customerId)
    try {
      let stored = await subscriptions(context).byExternalId(session.id, STRIPE_PAYGATE_ALIAS)
      if (stored?.fulfilledAt != null) return

      const amountMode = metadata.pricingMode === CheckoutPricingMode.Amount
      let completion: TopUpCompletion
      let record: PaymentSubscriptionRecord
      if (amountMode) {
        const amountMinor = integerMetadata(metadata, 'amountMinor')
        const chargedMinor = integerMetadata(metadata, 'chargeAmountMinor')
        const currency = metadata.currency?.toLowerCase()
        if (currency == null || session.currency?.toLowerCase() !== currency
          || session.amount_subtotal !== chargedMinor || amountMinor <= 0 || chargedMinor < amountMinor) {
          throw new PaygateError('amount-mismatch')
        }
        record = {
          sku: metadata.planSku ?? metadata.productSku, productSku: metadata.productSku,
          entityId: metadata.entityId, service: metadata.service, paygate: STRIPE_PAYGATE_ALIAS,
          externalId: session.id, status: SubscriptionStatus.Consumable, kind: 'consumable',
          pricingMode: CheckoutPricingMode.Amount, amountMinor, chargeAmountMinor: chargedMinor,
          currency, createdAt: new Date(),
        }
        completion = {
          mode: 'amount', entityId: metadata.entityId, amountMinor,
          chargeAmountMinor: chargedMinor, currency, productSku: metadata.productSku,
          planSku: metadata.planSku, service: metadata.service,
          paygate: STRIPE_PAYGATE_ALIAS, externalId: session.id,
        }
      } else {
        if (metadata.currency != null && session.currency?.toLowerCase() !== metadata.currency.toLowerCase()) {
          throw new PaygateError('currency-mismatch')
        }
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 })
        const units = lineItems.data.reduce((sum, line) => sum + (line.quantity ?? 0), 0)
        if (units <= 0) throw new PaygateError('units')
        record = {
          sku: metadata.planSku ?? metadata.productSku, productSku: metadata.productSku,
          entityId: metadata.entityId, service: metadata.service, paygate: STRIPE_PAYGATE_ALIAS,
          externalId: session.id, status: SubscriptionStatus.Consumable, kind: 'consumable', units,
          pricingMode: CheckoutPricingMode.Quantity,
          capabilities: [{ scope: PlanDuration.Consumable, permissions: { units } }],
          createdAt: new Date(),
        }
        completion = {
          mode: 'quantity', entityId: metadata.entityId, units, productSku: metadata.productSku,
          planSku: metadata.planSku, service: metadata.service,
          paygate: STRIPE_PAYGATE_ALIAS, externalId: session.id,
        }
      }
      if (stored == null) stored = await subscriptions(context).create(record)
      await observer(context).propagateTopUp(completion, context)
      await subscriptions(context).save({ ...stored, fulfilledAt: new Date() })
    } finally {
      unlockOn(customerId)
    }
  }

  const handler = {
    process: async (event: Stripe.Event) => {
      if (event.type in handler) await (handler as never as Record<string, (event: Stripe.Event) => Promise<void>>)[event.type](event)
    },
    'customer.created': async (event: Stripe.CustomerCreatedEvent) => handler._upsertCustomer(event.data.object),
    'customer.updated': async (event: Stripe.CustomerUpdatedEvent) => handler._upsertCustomer(event.data.object),
    'checkout.session.completed': async (event: Stripe.CheckoutSessionCompletedEvent) => fulfillPayment(event.data.object),
    'checkout.session.async_payment_succeeded': async (event: Stripe.CheckoutSessionAsyncPaymentSucceededEvent) =>
      fulfillPayment(event.data.object),
    'customer.subscription.created': async (event: Stripe.CustomerSubscriptionCreatedEvent) => handler._syncSubscription(event.data.object),
    'customer.subscription.updated': async (event: Stripe.CustomerSubscriptionUpdatedEvent) => handler._syncSubscription(event.data.object),
    'customer.subscription.deleted': async (event: Stripe.CustomerSubscriptionDeletedEvent) =>
      handler._syncSubscription(event.data.object, SubscriptionStatus.Canceled),

    _upsertCustomer: async (customer: Stripe.Customer) => {
      const resource = paygateCustomers(context)
      await lockOn(customer.id)
      try {
        const existing = await resource.loadByPgId(customer.id, STRIPE_PAYGATE_ALIAS)
        const data = {
          email: customer.email ?? undefined, name: customer.name ?? undefined,
          taxId: customer.tax_ids?.data?.[0]?.value ?? undefined,
          entityId: customer.metadata?.entityId ?? existing?.entityId,
          profileId: customer.metadata?.profileId ?? existing?.profileId,
        }
        if (existing == null) await resource.create({ paygate: STRIPE_PAYGATE_ALIAS, externalId: customer.id, ...data })
        else { Object.assign(existing, data); await resource.save(existing) }
      } finally { unlockOn(customer.id) }
    },

    _syncSubscription: async (pgSubscription: Stripe.Subscription, forced?: SubscriptionStatus) => {
      const metadata = pgSubscription.metadata ?? {}
      const customerId = customerIdOf(pgSubscription.customer)
      await lockOn(customerId)
      try {
        const status = forced ?? mapStatus(pgSubscription.status)
        for (const item of pgSubscription.items.data) {
          const planSku = item.price.lookup_key ?? metadata.planSku
          const entityId = metadata.entityId
          if (planSku == null || entityId == null) continue
          let plan: PaymentPlan | null = null
          try { plan = await payment(context).plan(planSku) as PaymentPlan } catch { /* archived plan */ }
          const productSku = plan?.productSku ?? metadata.productSku ?? planSku
          const service = metadata.service ?? productSku
          let record = await subscriptions(context).byExternalId(item.id, STRIPE_PAYGATE_ALIAS)
          const isNew = record?.initialPropagatedAt == null
          const values: Partial<PaymentSubscriptionRecord> = {
            sku: planSku, productSku, entityId, service, paygate: STRIPE_PAYGATE_ALIAS,
            externalId: item.id, status, kind: 'subscription',
            ...(plan?.capabilities != null && { capabilities: plan.capabilities }),
            ...(plan?.limits != null && { limits: plan.limits }),
            endsAt: (pgSubscription as never as { current_period_end?: number }).current_period_end != null
              ? new Date((pgSubscription as never as { current_period_end: number }).current_period_end * 1000) : undefined,
            canceledAt: status === SubscriptionStatus.Canceled ? new Date() : undefined,
          }
          if (record == null) record = await subscriptions(context).create({ createdAt: new Date(), ...values } as PaymentSubscriptionRecord)
          else { Object.assign(record, values); await subscriptions(context).save(record) }
          await observer(context).propagateSubscription({
            entityId, status, productSku, planSku, service, paygate: STRIPE_PAYGATE_ALIAS,
            externalId: item.id, isNew, capabilities: plan?.capabilities, limits: plan?.limits,
          }, context)
          if (isNew) {
            record.initialPropagatedAt = new Date()
            await subscriptions(context).save(record)
          }
        }
      } finally { unlockOn(customerId) }
    },
  }
  return handler
}
