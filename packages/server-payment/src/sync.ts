import { createHash } from 'node:crypto'
import type Stripe from 'stripe'
import { CheckoutPricingMode, ProductType } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { STRIPE_PAYGATE_ALIAS } from './consts.js'
import { fingerprints, payment, stripeClient } from './utils.js'
import type { PaymentPlan, PaymentProduct } from './types.js'

export const planLookupKey = (product: PaymentProduct, plan: PaymentPlan): string =>
  product.type === ProductType.Consumable ? `${product.sku}-consumable` : plan.sku

/** Whether a plan is sold through a paygate: never a free plan; otherwise its own gateways, else the product's. */
export const isSoldThrough = (product: PaymentProduct, plan: PaymentPlan, paygate: string): boolean =>
  plan.free !== true && (plan.gateways ?? product.gateways ?? []).includes(paygate)

/** Every product sold through Stripe with the plans it sells there. */
export const stripePlansOf = async (ctx: ApiContext): Promise<Array<{ product: PaymentProduct, plans: PaymentPlan[] }>> => {
  const products = await payment(ctx).products() as PaymentProduct[]
  const result: Array<{ product: PaymentProduct, plans: PaymentPlan[] }> = []
  for (const product of products) {
    if (!(product.gateways ?? []).includes(STRIPE_PAYGATE_ALIAS)) {
      continue
    }
    const plans = (await payment(ctx).allPlans(product.sku) as PaymentPlan[])
      .filter(plan => isSoldThrough(product, plan, STRIPE_PAYGATE_ALIAS))
    if (plans.length > 0) {
      result.push({ product, plans })
    }
  }

  return result
}

const fingerprintOf = (product: PaymentProduct, plans: PaymentPlan[]): string => createHash('sha256')
  .update(JSON.stringify({
    sku: product.sku, type: product.type, name: product.title,
    description: product.description ?? null, taxCode: product.taxCode ?? null,
    unitLabel: product.unitLabel ?? null, services: [...(product.services ?? [])].sort(),
    plans: plans.map(plan => ({
      sku: plan.sku, price: plan.price, currency: plan.currency ?? 'usd', duration: plan.duration,
      recurring: plan.recurring ?? null, pricingMode: plan.pricingMode ?? null,
      amountPolicy: plan.amountPolicy ?? null, quantityPolicy: plan.quantityPolicy ?? null,
      lookup: planLookupKey(product, plan),
    })).sort((a, b) => a.sku.localeCompare(b.sku)),
  })).digest('hex')

const ensureStripeProduct = async (stripe: Stripe, product: PaymentProduct): Promise<Stripe.Product> => {
  const params: Stripe.ProductCreateParams = {
    name: product.title, description: product.description || undefined, tax_code: product.taxCode,
    active: true,
    metadata: { sku: product.sku, ...(product.services && { services: product.services.join(',') }) },
  }
  if (product.type === ProductType.Consumable && product.unitLabel != null) params.unit_label = product.unitLabel
  try {
    await stripe.products.retrieve(product.sku)
    return await stripe.products.update(product.sku, params)
  } catch {
    return await stripe.products.create({ id: product.sku, ...params })
  }
}

const activePrices = async (stripe: Stripe, product: PaymentProduct): Promise<Stripe.Price[]> =>
  (await stripe.prices.list({ product: product.sku, active: true, limit: 100 })).data

const deactivateAmountPrice = async (stripe: Stripe, product: PaymentProduct, plan: PaymentPlan): Promise<void> => {
  const lookup = planLookupKey(product, plan)
  for (const price of (await activePrices(stripe, product)).filter(item => item.lookup_key === lookup)) {
    await stripe.prices.update(price.id, { active: false })
  }
}

const ensureStripePrice = async (stripe: Stripe, product: PaymentProduct, plan: PaymentPlan): Promise<void> => {
  if (plan.pricingMode === CheckoutPricingMode.Amount) {
    await deactivateAmountPrice(stripe, product, plan)
    return
  }
  const lookupKey = planLookupKey(product, plan)
  const unitAmount = Math.round(plan.price * 100)
  const currency = plan.currency ?? 'usd'
  const recurring = plan.recurring != null
    ? { interval: plan.recurring.interval } as Stripe.PriceCreateParams.Recurring : undefined
  const existing = await activePrices(stripe, product)
  const match = existing.find(price => price.lookup_key === lookupKey && price.unit_amount === unitAmount
    && price.currency === currency
    && ((price.recurring?.interval ?? null) === (recurring?.interval ?? null)))
  if (match != null) return
  for (const price of existing.filter(item => item.lookup_key === lookupKey)) {
    await stripe.prices.update(price.id, { active: false })
  }
  await stripe.prices.create({
    product: product.sku, currency, unit_amount: unitAmount, lookup_key: lookupKey,
    transfer_lookup_key: true, nickname: plan.sku,
    ...(recurring != null ? { recurring } : { billing_scheme: 'per_unit' }),
    metadata: { sku: plan.sku, ...(product.services && { services: product.services.join(',') }) },
  })
}

/**
 * Synchronize every product sold through Stripe, and its Stripe-sold plans, to Stripe products and
 * prices. A product whose declaration fingerprint is unchanged makes no paygate call. Free plans
 * and plans sold through no Stripe gateway are never synchronized.
 */
export const syncStripeProducts = async (ctx: ApiContext, stripe: Stripe): Promise<void> => {
  const fpRes = fingerprints(ctx)
  for (const { product, plans } of await stripePlansOf(ctx)) {
    const hash = fingerprintOf(product, plans)
    const stored = await fpRes.bySku(product.sku)
    if (stored != null && stored.hash === hash) continue
    const stripeProduct = await ensureStripeProduct(stripe, product)
    for (const plan of plans) await ensureStripePrice(stripe, product, plan)
    if (stored != null) {
      await fpRes.update({ ...stored, hash, productId: stripeProduct.id, updatedAt: new Date() })
    } else {
      await fpRes.create({ sku: product.sku, hash, productId: stripeProduct.id, updatedAt: new Date() })
    }
    console.info(`[payment] synced product '${product.sku}' to Stripe (${plans.length} plan(s))`)
  }
}

/** `syncStripeProducts` with this context's own Stripe client. */
export const syncPaymentProducts = async (ctx: ApiContext): Promise<void> =>
  await syncStripeProducts(ctx, await stripeClient(ctx))
