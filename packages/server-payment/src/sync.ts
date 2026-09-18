import { createHash } from 'node:crypto'
import type Stripe from 'stripe'
import { CheckoutPricingMode, ProductType, TaxBehavior } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { STRIPE_PAYGATE_ALIAS } from './consts.js'
import { fingerprints, payment, stripeClient, stripePricingConfig } from './utils.js'
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

/**
 * `behavior` is hashed alongside the catalogue: an undeclared policy hashes as `null`, so declaring
 * or changing `tax.behavior` re-syncs every product exactly once, the same as any other catalogue
 * edit.
 */
const fingerprintOf = (
  product: PaymentProduct, plans: PaymentPlan[], behavior: TaxBehavior | null,
): string => createHash('sha256')
  .update(JSON.stringify({
    sku: product.sku, type: product.type, name: product.title,
    description: product.description ?? null, taxCode: product.taxCode ?? null,
    unitLabel: product.unitLabel ?? null, services: [...(product.services ?? [])].sort(),
    behavior,
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

/** Whether `price` already carries the OPPOSITE of `behavior` — never `unspecified`, which is not a conflict. */
const opposesBehavior = (price: Stripe.Price, behavior: TaxBehavior | null): boolean =>
  behavior != null && price.tax_behavior !== 'unspecified' && price.tax_behavior !== behavior

/**
 * The behavior the Stripe account's own Tax Settings resolve to for `currency`, or `null` when no
 * default is configured yet (nothing established to disrupt). `inferred_by_currency` follows
 * Stripe's own rule: exclusive for USD/CAD, inclusive otherwise.
 */
const accountDefaultBehavior = async (stripe: Stripe, currency: string): Promise<TaxBehavior | null> => {
  const { defaults } = await stripe.tax.settings.retrieve()
  if (defaults.tax_behavior === 'inferred_by_currency') {
    return ['usd', 'cad'].includes(currency.toLowerCase()) ? TaxBehavior.Exclusive : TaxBehavior.Inclusive
  }
  if (defaults.tax_behavior === 'exclusive') return TaxBehavior.Exclusive
  if (defaults.tax_behavior === 'inclusive') return TaxBehavior.Inclusive
  return null
}

/**
 * Give `price` the declared `behavior` while it is still `unspecified` (the only state Stripe lets
 * an existing price's `tax_behavior` be set from). Skipped, with a `console.error`, when the
 * account's own default resolves to the opposite behavior — applying ours would then change what an
 * existing renewal actually charges — unless `migrateUnspecifiedPrices` opts into that migration.
 */
const applyUnspecifiedBehavior = async (
  stripe: Stripe, price: Stripe.Price, lookupKey: string, behavior: TaxBehavior, migrateUnspecifiedPrices: boolean,
): Promise<void> => {
  if (!migrateUnspecifiedPrices) {
    const resolved = await accountDefaultBehavior(stripe, price.currency)
    if (resolved != null && resolved !== behavior) {
      console.error(
        `[payment] price '${lookupKey}' left 'unspecified': the Stripe account's default tax `
        + `behavior for ${price.currency.toUpperCase()} is '${resolved}', not the declared `
        + `'${behavior}' — applying it would change existing renewal amounts. Set `
        + '`stripe.migrateUnspecifiedPrices` to override.',
      )
      return
    }
  }
  await stripe.prices.update(price.id, { tax_behavior: behavior })
}

const ensureStripePrice = async (
  stripe: Stripe, product: PaymentProduct, plan: PaymentPlan,
  behavior: TaxBehavior | null, migrateUnspecifiedPrices: boolean,
): Promise<void> => {
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
  const candidate = existing.find(price => price.lookup_key === lookupKey && price.unit_amount === unitAmount
    && price.currency === currency
    && ((price.recurring?.interval ?? null) === (recurring?.interval ?? null)))
  if (candidate != null && !opposesBehavior(candidate, behavior)) {
    if (behavior != null && candidate.tax_behavior === 'unspecified') {
      await applyUnspecifiedBehavior(stripe, candidate, lookupKey, behavior, migrateUnspecifiedPrices)
    }
    return
  }
  for (const price of existing.filter(item => item.lookup_key === lookupKey)) {
    await stripe.prices.update(price.id, { active: false })
  }
  await stripe.prices.create({
    product: product.sku, currency, unit_amount: unitAmount, lookup_key: lookupKey,
    transfer_lookup_key: true, nickname: plan.sku,
    ...(recurring != null ? { recurring } : { billing_scheme: 'per_unit' }),
    ...(behavior != null ? { tax_behavior: behavior } : {}),
    metadata: { sku: plan.sku, ...(product.services && { services: product.services.join(',') }) },
  })
}

/**
 * Synchronize every product sold through Stripe, and its Stripe-sold plans, to Stripe products and
 * prices. A product whose declaration fingerprint is unchanged makes no paygate call. Free plans
 * and plans sold through no Stripe gateway are never synchronized.
 *
 * The declared `PricingPolicy.tax.behavior` (absent by default, so a price's `tax_behavior` stays
 * whatever it already was) is applied to a matching price only while it is `unspecified` — Stripe
 * forbids changing a price once set to `exclusive` or `inclusive` — and to a fresh one on creation.
 * A price carrying the OPPOSITE behavior is deactivated and replaced, same as any other mismatch.
 */
export const syncStripeProducts = async (ctx: ApiContext, stripe: Stripe): Promise<void> => {
  const fpRes = fingerprints(ctx)
  const behavior = (await payment(ctx).pricingPolicy()).tax.behavior ?? null
  const migrateUnspecifiedPrices = (await stripePricingConfig(ctx))?.migrateUnspecifiedPrices ?? false
  for (const { product, plans } of await stripePlansOf(ctx)) {
    const hash = fingerprintOf(product, plans, behavior)
    const stored = await fpRes.bySku(product.sku)
    if (stored != null && stored.hash === hash) continue
    const stripeProduct = await ensureStripeProduct(stripe, product)
    for (const plan of plans) await ensureStripePrice(stripe, product, plan, behavior, migrateUnspecifiedPrices)
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
