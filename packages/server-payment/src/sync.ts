import { createHash } from 'node:crypto'
import type Stripe from 'stripe'
import { CheckoutPricingMode, ProductType, TaxBehavior, type PlanPriceView } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { PaymentPlan, PaymentProduct, SyncedPrice, SyncedPriceOption } from './types.js'
import type { StripeFxRateCache } from './plugins/fx/types.js'
import { log } from './log.js'
import type { ResolvedPlan } from './types.local.js'
import { fxOf } from './plugins/fx.js'
import { paymentAccessOf } from './access.js'
import { catalogueOf } from './catalogue.js'
import { planHelper } from './plan.js'
import type { ProductSyncHelper } from './sync/types.js'

/**
 * The exact prices a plan is also charged in: its declared `currencyPrices`, and its catalogue
 * currency when that is one of the consumer-rights region currencies but not the Price's default
 * (a USD catalogue price synced as EUR keeps an exact USD option). A declared price in the default
 * currency replaces the converted default amount instead.
 */
const optionsOf = (
  plan: PaymentPlan, currency: string, sourceUnitAmount: number, sourceCurrency: string, regionCurrencies: Set<string>,
): { unitAmount?: number, options: SyncedPriceOption[] } => {
  const options = new Map<string, number>()
  if (sourceCurrency !== currency && regionCurrencies.has(sourceCurrency)) {
    options.set(sourceCurrency, sourceUnitAmount)
  }
  let unitAmount: number | undefined
  for (const [raw, amount] of Object.entries(plan.currencyPrices ?? {})) {
    const code = raw.toLowerCase()
    const minor = Math.round(amount * 100)
    if (code === currency) {
      unitAmount = minor
    } else {
      options.set(code, minor)
    }
  }

  return {
    ...(unitAmount != null ? { unitAmount } : {}),
    options: [...options.entries()].map(([code, amount]) => ({ currency: code, unitAmount: amount }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
  }
}

/**
 * `behavior` is hashed alongside the catalogue: an undeclared policy hashes as `null`, so declaring
 * or changing `tax.behavior` re-syncs every product exactly once, the same as any other catalogue
 * edit.
 */
const fingerprintOf = (
  product: PaymentProduct, plans: ResolvedPlan[], behavior: TaxBehavior | null,
): string => createHash('sha256')
  .update(JSON.stringify({
    sku: product.sku, type: product.type, name: product.title,
    description: product.description ?? null, taxCode: product.taxCode ?? null,
    unitLabel: product.unitLabel ?? null, services: [...(product.services ?? [])].sort(),
    behavior,
    plans: plans.map(({ plan, unitAmount, currency, sourceUnitAmount, sourceCurrency, options }) => ({
      sku: plan.sku, price: plan.price, currency, unitAmount, sourceUnitAmount, sourceCurrency,
      duration: plan.duration, recurring: plan.recurring ?? null, pricingMode: plan.pricingMode ?? null,
      amountPolicy: plan.amountPolicy ?? null, quantityPolicy: plan.quantityPolicy ?? null,
      lookup: planHelper.planLookupKey(product, plan),
      // Only when present, so a catalogue without options keeps the fingerprint it always had.
      ...(options.length > 0 ? { options } : {}),
    })).sort((a, b) => a.sku.localeCompare(b.sku)),
  })).digest('hex')

/** A price's `currency_options` besides its default currency (read only once expanded). */
const priceOptionsOf = (price: Stripe.Price): Record<string, { unit_amount?: number | null, tax_behavior?: string | null }> =>
  Object.fromEntries(Object.entries(price.currency_options ?? {}).filter(([code]) => code !== price.currency))

/** Whether a price carries exactly these options (and, with a declared behavior, with that behavior). */
const optionsMatch = (price: Stripe.Price, options: SyncedPriceOption[], behavior: TaxBehavior | null): boolean => {
  const current = priceOptionsOf(price)
  if (Object.keys(current).length !== options.length) {
    return false
  }

  return options.every(option => current[option.currency]?.unit_amount === option.unitAmount
    && (behavior == null || current[option.currency]?.tax_behavior == null
      || current[option.currency]?.tax_behavior === 'unspecified' || current[option.currency]?.tax_behavior === behavior))
}

/** Whether `price` already carries the OPPOSITE of `behavior` — never `unspecified`, which is not a conflict. */
const opposesBehavior = (price: Stripe.Price, behavior: TaxBehavior | null): boolean =>
  behavior != null && price.tax_behavior !== 'unspecified' && price.tax_behavior !== behavior

export const makeProductSyncHelper = (ctx: ApiContext): ProductSyncHelper => {
  const access = paymentAccessOf(ctx)

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
    (await stripe.prices.list({ product: product.sku, active: true, limit: 100, expand: ['data.currency_options'] })).data

  const deactivateAmountPrice = async (stripe: Stripe, product: PaymentProduct, plan: PaymentPlan): Promise<void> => {
    const lookup = planHelper.planLookupKey(product, plan)
    for (const price of (await activePrices(stripe, product)).filter(item => item.lookup_key === lookup)) {
      await stripe.prices.update(price.id, { active: false })
    }
  }

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
   * an existing price's `tax_behavior` be set from). Skipped, with a `log.error`, when the
   * account's own default resolves to the opposite behavior — applying ours would then change what an
   * existing renewal actually charges — unless `migrateUnspecifiedPrices` opts into that migration.
   */
  const applyUnspecifiedBehavior = async (
    stripe: Stripe, price: Stripe.Price, lookupKey: string, behavior: TaxBehavior, migrateUnspecifiedPrices: boolean,
  ): Promise<void> => {
    if (!migrateUnspecifiedPrices) {
      const resolved = await accountDefaultBehavior(stripe, price.currency)
      if (resolved != null && resolved !== behavior) {
        log.error(
          'Price left unspecified: the Stripe account\'s default tax behavior differs from the declared one — '
          + 'applying it would change existing renewal amounts; set `stripe.migrateUnspecifiedPrices` to override',
          { lookupKey, currency: price.currency, accountBehavior: resolved, declaredBehavior: behavior },
        )
        return
      }
    }
    await stripe.prices.update(price.id, { tax_behavior: behavior })
  }

  const ensureStripePrice = async (
    stripe: Stripe, product: PaymentProduct, resolved: ResolvedPlan,
    behavior: TaxBehavior | null, migrateUnspecifiedPrices: boolean,
  ): Promise<Stripe.Price | null> => {
    const { plan, unitAmount, currency, options } = resolved
    if (plan.pricingMode === CheckoutPricingMode.Amount) {
      await deactivateAmountPrice(stripe, product, plan)
      return null
    }
    const lookupKey = planHelper.planLookupKey(product, plan)
    const recurring = plan.recurring != null
      ? { interval: plan.recurring.interval } as Stripe.PriceCreateParams.Recurring : undefined
    const existing = await activePrices(stripe, product)
    const candidate = existing.find(price => price.lookup_key === lookupKey && price.unit_amount === unitAmount
      && price.currency === currency
      && ((price.recurring?.interval ?? null) === (recurring?.interval ?? null))
      && optionsMatch(price, options, behavior))
    if (candidate != null && !opposesBehavior(candidate, behavior)) {
      if (behavior != null && candidate.tax_behavior === 'unspecified') {
        await applyUnspecifiedBehavior(stripe, candidate, lookupKey, behavior, migrateUnspecifiedPrices)
      }
      return candidate
    }
    // A changed option replaces the Price like any other change — options are never edited in place,
    // so a subscriber keeps exactly the Price (and currency amounts) they accepted.
    for (const price of existing.filter(item => item.lookup_key === lookupKey)) {
      await stripe.prices.update(price.id, { active: false })
    }

    return await stripe.prices.create({
      product: product.sku, currency, unit_amount: unitAmount, lookup_key: lookupKey,
      transfer_lookup_key: true, nickname: plan.sku,
      ...(recurring != null ? { recurring } : { billing_scheme: 'per_unit' }),
      ...(behavior != null ? { tax_behavior: behavior } : {}),
      ...(options.length > 0 ? {
        currency_options: Object.fromEntries(options.map(option => [option.currency, {
          unit_amount: option.unitAmount, ...(behavior != null ? { tax_behavior: behavior } : {}),
        }])),
      } : {}),
      metadata: { sku: plan.sku, ...(product.services && { services: product.services.join(',') }) },
    })
  }

  const syncStripeProducts = async (stripe: Stripe): Promise<void> => {
    const fpRes = access.fingerprints()
    const behavior = (await access.payment().pricingPolicy()).tax.behavior ?? null
    const migrateUnspecifiedPrices = (await access.stripePricingConfig())?.migrateUnspecifiedPrices ?? false
    const fxRates: StripeFxRateCache = new Map()
    const rights = await access.payment().consumerRightsPolicy()
    const regionCurrencies = new Set(Object.values(rights?.currencies ?? {})
      .filter((code): code is string => typeof code === 'string').map(code => code.toLowerCase()))
    for (const { product, plans } of await catalogueOf(ctx).stripePlansOf()) {
      const resolvedPlans: ResolvedPlan[] = []
      for (const plan of plans) {
        const sourceUnitAmount = Math.round(plan.price * 100)
        const sourceCurrency = (plan.currency ?? 'usd').toLowerCase()
        if (plan.pricingMode === CheckoutPricingMode.Amount) {
          resolvedPlans.push({ plan, unitAmount: sourceUnitAmount, currency: sourceCurrency, sourceUnitAmount, sourceCurrency, options: [] })
          continue
        }
        const settled = await fxOf(ctx).settlementAmount(stripe, sourceUnitAmount, sourceCurrency, fxRates)
        const { unitAmount, options } = optionsOf(plan, settled.currency, sourceUnitAmount, sourceCurrency, regionCurrencies)
        resolvedPlans.push({
          plan, unitAmount: unitAmount ?? settled.amountMinor, currency: settled.currency, sourceUnitAmount, sourceCurrency,
          options,
        })
      }
      const hash = fingerprintOf(product, resolvedPlans, behavior)
      const stored = await fpRes.bySku(product.sku)
      // A row from before prices were persisted syncs once more, so `planPrices` can read it.
      if (stored != null && stored.hash === hash && stored.prices != null) continue
      const stripeProduct = await ensureStripeProduct(stripe, product)
      const prices: SyncedPrice[] = []
      const syncedAt = new Date()
      for (const resolved of resolvedPlans) {
        const price = await ensureStripePrice(stripe, product, resolved, behavior, migrateUnspecifiedPrices)
        if (price != null) {
          prices.push({
            planSku: resolved.plan.sku, priceId: price.id, lookupKey: planHelper.planLookupKey(product, resolved.plan),
            currency: resolved.currency, unitAmount: resolved.unitAmount, options: resolved.options,
            ...(behavior != null ? { taxBehavior: behavior } : price.tax_behavior != null ? { taxBehavior: price.tax_behavior } : {}),
            ...(resolved.plan.recurring != null ? { interval: resolved.plan.recurring.interval } : {}),
            sourceUnitAmount: resolved.sourceUnitAmount, sourceCurrency: resolved.sourceCurrency, syncedAt,
          })
        }
      }
      if (stored != null) {
        await fpRes.update({ ...stored, hash, productId: stripeProduct.id, prices, updatedAt: new Date() })
      } else {
        await fpRes.create({ sku: product.sku, hash, productId: stripeProduct.id, prices, updatedAt: new Date() })
      }
      log.info('Product synced to Stripe', { sku: product.sku, plans: plans.length }, { event: 'payment.product.synced' })
    }
  }

  const syncedPlanPrices = async (productSku: string): Promise<PlanPriceView[]> => {
    const row = await access.fingerprints().bySku(productSku)
    const behaviorOf = (value: string | undefined): TaxBehavior | undefined =>
      value === TaxBehavior.Exclusive || value === TaxBehavior.Inclusive ? value : undefined
    const views: PlanPriceView[] = []
    for (const price of row?.prices ?? []) {
      const taxBehavior = behaviorOf(price.taxBehavior ?? undefined)
      const shared = {
        planSku: price.planSku, ...(taxBehavior != null ? { taxBehavior } : {}),
        ...(price.interval != null ? { interval: price.interval } : {}),
      }
      views.push({ ...shared, currency: price.currency, unitAmountMinor: price.unitAmount, default: true })
      for (const option of price.options ?? []) {
        views.push({ ...shared, currency: option.currency, unitAmountMinor: option.unitAmount, default: false })
      }
    }

    return views
  }

  const syncPaymentProducts = async (): Promise<void> => {
    const factory = access.gatewayOf()?.stripe
    await syncStripeProducts(factory != null ? await factory(ctx) : await access.stripeClient())
  }

  return { syncStripeProducts, syncedPlanPrices, syncPaymentProducts }
}

/** The catalogue sync of a context — one per context. */
export const productSyncOf = memoHelper.oncePer(makeProductSyncHelper)
