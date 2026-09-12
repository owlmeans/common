import Stripe from 'stripe'
import {
  assertCheckoutAmount, chargeAmountMinor, CheckoutPricingMode, PaygateError, ProductError, ProductType,
} from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { STRIPE_PAYGATE_ALIAS, STRIPE_SIGNATURE } from '../consts.js'
import { paygateCustomers, payment, stripeClient, stripeConfig } from '../utils.js'
import { planLookupKey } from '../sync.js'
import { createEventHandler } from './events.js'
import type { CreateLinkParams, PaymentPlan, PaymentPlugin, PaymentProduct } from '../types.js'

const taxOptions = (promotions: boolean): Partial<Stripe.Checkout.SessionCreateParams> => ({
  automatic_tax: { enabled: true },
  billing_address_collection: 'required',
  tax_id_collection: { enabled: true },
  customer_update: { address: 'auto', name: 'auto' },
  allow_promotion_codes: promotions,
})

const ensureStripeCustomer = async (
  ctx: ApiContext, stripe: Stripe, params: CreateLinkParams,
): Promise<Stripe.Customer> => {
  const resource = paygateCustomers(ctx)
  const existing = await resource.byEntity(params.entityId, STRIPE_PAYGATE_ALIAS)
  if (existing != null) {
    const retrieved = await stripe.customers.retrieve(existing.externalId)
    if (!(retrieved as Stripe.DeletedCustomer).deleted) return retrieved as Stripe.Customer
  }
  const created = await stripe.customers.create({
    metadata: {
      entityId: params.entityId, ...(params.profileId && { profileId: params.profileId }),
      service: params.service,
    },
  })
  if (existing != null) {
    Object.assign(existing, { externalId: created.id })
    await resource.save(existing)
  } else {
    await resource.create({
      paygate: STRIPE_PAYGATE_ALIAS, externalId: created.id, entityId: params.entityId,
      profileId: params.profileId,
    })
  }
  return created
}

const findPrice = async (stripe: Stripe, productSku: string, lookupKey: string): Promise<Stripe.Price> => {
  const prices = await stripe.prices.list({ product: productSku, active: true, lookup_keys: [lookupKey] })
  if (prices.data.length === 0) throw new ProductError(`price:${lookupKey}`)
  return prices.data[0]
}

const sharedSession = (
  customer: Stripe.Customer, params: CreateLinkParams, product: PaymentProduct,
  plan: PaymentPlan, metadata: Record<string, string>,
): Pick<Stripe.Checkout.SessionCreateParams, 'customer' | 'success_url' | 'cancel_url' | 'metadata'> => ({
  customer: customer.id,
  success_url: params.successUrl,
  cancel_url: params.cancelUrl ?? params.successUrl,
  metadata: {
    pricingMode: plan.pricingMode ?? CheckoutPricingMode.Quantity,
    currency: (plan.currency ?? 'usd').toLowerCase(),
    entityId: params.entityId,
    ...(params.profileId && { profileId: params.profileId }),
    service: params.service,
    productSku: product.sku,
    planSku: plan.sku,
    ...metadata,
  },
})

export const amountCheckoutLineItem = (
  product: PaymentProduct, plan: PaymentPlan, amountMinor: number,
): { lineItem: Stripe.Checkout.SessionCreateParams.LineItem; chargeMinor: number; currency: string } => {
  if (plan.amountPolicy == null) throw new ProductError(`amount-policy:${plan.sku}`)
  assertCheckoutAmount(plan.amountPolicy, amountMinor)
  const chargeMinor = chargeAmountMinor(amountMinor, plan.amountPolicy)
  const currency = plan.amountPolicy.currency.toLowerCase()
  return {
    lineItem: {
      price_data: {
        product: product.sku, currency, unit_amount: chargeMinor, tax_behavior: 'exclusive',
      },
      quantity: 1,
    },
    chargeMinor,
    currency,
  }
}

export const quantityCheckoutLineItem = (
  price: Stripe.Price, policy: { minimum: number; maximum: number; default: number },
): Stripe.Checkout.SessionCreateParams.LineItem => ({
  price: price.id,
  adjustable_quantity: { enabled: true, minimum: policy.minimum, maximum: policy.maximum },
  quantity: policy.default,
})

export const stripePlugin: PaymentPlugin = {
  createLink: async (ctx, params) => {
    const stripe = await stripeClient(ctx)
    const product = await payment(ctx).product(params.productSku) as PaymentProduct
    const plans = await payment(ctx).allPlans(product.sku) as PaymentPlan[]
    const customer = await ensureStripeCustomer(ctx, stripe, params)

    if (product.type === ProductType.Consumable) {
      const plan = plans.find(item => item.sku === params.planSku) ?? plans[0]
      if (plan == null) throw new ProductError('plan')

      if (plan.pricingMode === CheckoutPricingMode.Amount) {
        if (params.amountMinor == null) throw new ProductError('amount')
        const { lineItem, chargeMinor, currency } = amountCheckoutLineItem(product, plan, params.amountMinor)
        const session = await stripe.checkout.sessions.create({
          mode: 'payment', line_items: [lineItem], invoice_creation: { enabled: true },
          ...taxOptions(false),
          ...sharedSession(customer, params, product, plan, {
            pricingMode: CheckoutPricingMode.Amount,
            currency,
            amountMinor: String(params.amountMinor),
            chargeAmountMinor: String(chargeMinor),
          }),
        })
        if (session.url == null) throw new PaygateError('session')
        return session.url
      }

      const price = await findPrice(stripe, product.sku, planLookupKey(product, plan))
      const policy = plan.quantityPolicy ?? {
        minimum: plan.minQuantity ?? plan.limits?.['consumable:units']?.limit ?? 1,
        maximum: plan.maxQuantity ?? Math.max(100_000, plan.minQuantity ?? 1),
        default: plan.defaultQuantity ?? plan.minQuantity ?? 1,
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [quantityCheckoutLineItem(price, policy)],
        invoice_creation: { enabled: true },
        ...taxOptions(true),
        ...sharedSession(customer, params, product, plan, { pricingMode: CheckoutPricingMode.Quantity }),
      })
      if (session.url == null) throw new PaygateError('session')
      return session.url
    }

    const plan = plans.find(item => item.sku === params.planSku)
      ?? plans.find(item => item.recurring != null) ?? plans[0]
    if (plan == null) throw new ProductError('plan')
    const price = await findPrice(stripe, product.sku, planLookupKey(product, plan))
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: {
        metadata: {
          pricingMode: CheckoutPricingMode.Quantity, entityId: params.entityId,
          service: params.service, productSku: product.sku, planSku: plan.sku,
        },
      },
      ...taxOptions(true),
      ...sharedSession(customer, params, product, plan, {}),
    })
    if (session.url == null) throw new PaygateError('session')
    return session.url
  },

  handleWebhook: async (request, ctx) => {
    const config = await stripeConfig(ctx)
    const stripe = await stripeClient(ctx)
    const typed = request as {
      original?: { rawBody?: string | Buffer }; rawBody?: string | Buffer
      headers: Record<string, string | string[] | undefined>
    }
    const rawBody = typed.original?.rawBody ?? typed.rawBody
    const signature = typed.headers[STRIPE_SIGNATURE.toLowerCase()]
    if (rawBody == null || typeof signature !== 'string') throw new PaygateError('signature')
    const event = await stripe.webhooks.constructEventAsync(rawBody, signature, config.webhook)
    await createEventHandler(ctx, stripe).process(event)
  },

  manageSubscription: async (ctx, entityId, returnUrl) => {
    const stripe = await stripeClient(ctx)
    const customer = await paygateCustomers(ctx).byEntity(entityId, STRIPE_PAYGATE_ALIAS)
    if (customer == null) throw new PaygateError('customer')
    return (await stripe.billingPortal.sessions.create({ customer: customer.externalId, return_url: returnUrl })).url
  },
}
