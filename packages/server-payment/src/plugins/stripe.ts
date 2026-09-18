import type Stripe from 'stripe'
import {
  assertCheckoutAmount, chargeAmountMinor, CheckoutPricingMode, PaygateError, ProductError, ProductType,
  TaxBehavior, WebhookSetupError,
} from '@owlmeans/payment'
import type { PricingPolicy } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { STRIPE_PAYGATE_ALIAS, STRIPE_SIGNATURE } from '../consts.js'
import { paygateCustomers, payment, stripePricingConfig } from '../utils.js'
import { isSoldThrough, planLookupKey } from '../sync.js'
import { createEventHandler } from './events.js'
import { settlementAmount } from './fx.js'
import { stripeWebhookSecrets } from './webhook-manager.js'
import type { CreateLinkParams, PaymentPlan, PaymentProduct } from '../types.js'

/**
 * A Checkout Session's tax and currency options, entirely driven by the declared `PricingPolicy` —
 * an undeclared one (`DEFAULT_PRICING_POLICY`) reproduces exactly what every session hard-coded
 * before this policy existed: automatic tax and tax-id collection on, no Adaptive Pricing.
 *
 * `customer_update.address` lets automatic tax use the billing address Checkout just collected
 * rather than only a previously saved one; `customer_update.name` lets tax-id collection save the
 * business name it collects. Each is included only for the concern that needs it.
 */
const checkoutOptions = (policy: PricingPolicy, promotions: boolean): Partial<Stripe.Checkout.SessionCreateParams> => {
  const customerUpdate: Stripe.Checkout.SessionCreateParams.CustomerUpdate = {}
  if (policy.tax.automatic) customerUpdate.address = 'auto'
  if (policy.tax.collectTaxId) customerUpdate.name = 'auto'

  return {
    ...(policy.tax.automatic
      ? { automatic_tax: { enabled: true }, billing_address_collection: 'required' as const }
      : {}),
    ...(policy.tax.collectTaxId ? { tax_id_collection: { enabled: true } } : {}),
    ...(Object.keys(customerUpdate).length > 0 ? { customer_update: customerUpdate } : {}),
    ...(policy.currency.adaptive === true ? { adaptive_pricing: { enabled: true } } : {}),
    allow_promotion_codes: promotions,
  }
}

const ensureStripeCustomer = async (
  ctx: ApiContext, stripe: Stripe, params: CreateLinkParams,
): Promise<Stripe.Customer> => {
  const resource = paygateCustomers(ctx)
  const existing = await resource.byEntity(params.entityId, STRIPE_PAYGATE_ALIAS)
  if (existing != null && existing.deletedAt == null) {
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
    const { deletedAt: _deleted, ...kept } = existing
    await resource.update({ ...kept, externalId: created.id })
  } else {
    await resource.create({
      paygate: STRIPE_PAYGATE_ALIAS, externalId: created.id, entityId: params.entityId,
      ...(params.profileId != null ? { profileId: params.profileId } : {}),
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
  product: PaymentProduct, plan: PaymentPlan, amountMinor: number, behavior: TaxBehavior = TaxBehavior.Exclusive,
): { lineItem: Stripe.Checkout.SessionCreateParams.LineItem; chargeMinor: number; currency: string } => {
  if (plan.amountPolicy == null) throw new ProductError(`amount-policy:${plan.sku}`)
  assertCheckoutAmount(plan.amountPolicy, amountMinor)
  const chargeMinor = chargeAmountMinor(amountMinor, plan.amountPolicy)
  const currency = plan.amountPolicy.currency.toLowerCase()
  return {
    lineItem: {
      price_data: {
        product: product.sku, currency, unit_amount: chargeMinor, tax_behavior: behavior,
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

/**
 * A Stripe Checkout URL: an amount or quantity purchase of a consumable product, or a subscription
 * to `planSku` (else the product's first recurring plan). A free plan is never checked out.
 */
export const createCheckoutLink = async (ctx: ApiContext, stripe: Stripe, params: CreateLinkParams): Promise<string> => {
  const product = await payment(ctx).product(params.productSku) as PaymentProduct
  const plans = (await payment(ctx).allPlans(product.sku) as PaymentPlan[])
    .filter(plan => isSoldThrough(product, plan, STRIPE_PAYGATE_ALIAS))
  if (params.planSku != null && !plans.some(plan => plan.sku === params.planSku)) {
    throw new ProductError(`plan:${params.planSku}`)
  }
  const customer = await ensureStripeCustomer(ctx, stripe, params)
  const pricing = await payment(ctx).pricingPolicy()

  if (product.type === ProductType.Consumable) {
    const plan = plans.find(item => item.sku === params.planSku) ?? plans[0]
    if (plan == null) throw new ProductError('plan')

    if (plan.pricingMode === CheckoutPricingMode.Amount) {
      if (params.amountMinor == null) throw new ProductError('amount')
      const { chargeMinor: sourceChargeMinor, currency: amountCurrency } = amountCheckoutLineItem(
        product, plan, params.amountMinor, pricing.tax.behavior,
      )
      const settled = await settlementAmount(ctx, stripe, sourceChargeMinor, amountCurrency)
      const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
        price_data: {
          product: product.sku, currency: settled.currency, unit_amount: settled.amountMinor,
          tax_behavior: pricing.tax.behavior,
        },
        quantity: 1,
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', line_items: [lineItem], invoice_creation: { enabled: true },
        ...checkoutOptions(pricing, false),
        ...sharedSession(customer, params, product, plan, {
          pricingMode: CheckoutPricingMode.Amount,
          currency: settled.currency,
          amountCurrency,
          amountMinor: String(params.amountMinor),
          sourceChargeAmountMinor: String(sourceChargeMinor),
          chargeAmountMinor: String(settled.amountMinor),
        }),
      })
      if (session.url == null) throw new PaygateError('session')
      return session.url
    }

    const price = await findPrice(stripe, product.sku, planLookupKey(product, plan))
    const quantityPolicy = plan.quantityPolicy ?? {
      minimum: plan.minQuantity ?? 1,
      maximum: plan.maxQuantity ?? Math.max(100_000, plan.minQuantity ?? 1),
      default: plan.defaultQuantity ?? plan.minQuantity ?? 1,
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [quantityCheckoutLineItem(price, quantityPolicy)],
      invoice_creation: { enabled: true },
      ...checkoutOptions(pricing, true),
      ...sharedSession(customer, params, product, plan, { pricingMode: CheckoutPricingMode.Quantity }),
    })
    if (session.url == null) throw new PaygateError('session')
    return session.url
  }

  const plan = plans.find(item => item.sku === params.planSku)
    ?? plans.find(item => item.recurring != null) ?? plans[0]
  if (plan == null) throw new ProductError('plan')
  const price = await findPrice(stripe, product.sku, planLookupKey(product, plan))
  const subscriptionPaymentMethodTypes = (
    await stripePricingConfig(ctx)
  )?.subscriptionPaymentMethodTypes as Stripe.Checkout.SessionCreateParams.PaymentMethodType[] | undefined
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription', line_items: [{ price: price.id, quantity: 1 }],
    ...(subscriptionPaymentMethodTypes != null ? { payment_method_types: subscriptionPaymentMethodTypes } : {}),
    subscription_data: {
      metadata: {
        pricingMode: CheckoutPricingMode.Quantity, entityId: params.entityId,
        service: params.service, productSku: product.sku, planSku: plan.sku,
      },
    },
    ...checkoutOptions(pricing, true),
    ...sharedSession(customer, params, product, plan, {}),
  })
  if (session.url == null) throw new PaygateError('session')
  return session.url
}

interface WebhookRequest {
  original?: { rawBody?: string | Buffer }
  rawBody?: string | Buffer
  headers: Record<string, string | string[] | undefined>
}

/**
 * Verify a Stripe webhook against the configured override secret, then the managed endpoint's
 * stored one, and dispatch it.
 *
 * @throws PaygateError('signature') | WebhookSetupError('secret')
 */
export const handleStripeWebhook = async (ctx: ApiContext, stripe: Stripe, request: unknown): Promise<void> => {
  const typed = request as WebhookRequest
  const rawBody = typed.original?.rawBody ?? typed.rawBody
  const signature = typed.headers[STRIPE_SIGNATURE.toLowerCase()]
  if (rawBody == null || typeof signature !== 'string') throw new PaygateError('signature')

  const secrets = await stripeWebhookSecrets(ctx)
  if (secrets.length === 0) {
    throw new WebhookSetupError('secret')
  }
  let event: Stripe.Event | null = null
  for (const secret of secrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret)
      break
    } catch {
      // Try the next secret; a signature none of them verifies is refused below.
    }
  }
  if (event == null) {
    throw new PaygateError('signature')
  }

  await createEventHandler(ctx, stripe).process(event)
}
