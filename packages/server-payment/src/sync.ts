import { createHash } from 'node:crypto'
import { CheckoutPricingMode, TaxBehavior, type PlanPriceView } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { PaymentPlan, PaymentProduct, SyncedPrice, SyncedPriceOption } from './types.js'
import type { FxQuoteCache } from './plugins/types.local.js'
import type { Paygate } from './paygate/types.js'
import { paygatesOf } from './paygate/registry.js'
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

export const makeProductSyncHelper = (ctx: ApiContext): ProductSyncHelper => {
  const access = paymentAccessOf(ctx)

  const syncProducts = async (paygate: Paygate): Promise<void> => {
    const catalogue = paygate.catalogue
    if (catalogue == null) {
      return
    }
    const fpRes = access.fingerprints()
    const behavior = (await access.payment().pricingPolicy()).tax.behavior ?? null
    const fxRates: FxQuoteCache = new Map()
    const rights = await access.payment().consumerRightsPolicy()
    const regionCurrencies = new Set(Object.values(rights?.currencies ?? {})
      .filter((code): code is string => typeof code === 'string').map(code => code.toLowerCase()))
    for (const { product, plans } of await catalogueOf(ctx).plansSoldThrough(paygate.id)) {
      const resolvedPlans: ResolvedPlan[] = []
      for (const plan of plans) {
        const sourceUnitAmount = Math.round(plan.price * 100)
        const sourceCurrency = (plan.currency ?? 'usd').toLowerCase()
        if (plan.pricingMode === CheckoutPricingMode.Amount) {
          resolvedPlans.push({ plan, unitAmount: sourceUnitAmount, currency: sourceCurrency, sourceUnitAmount, sourceCurrency, options: [] })
          continue
        }
        const settled = await fxOf(ctx).settlementAmount(paygate, sourceUnitAmount, sourceCurrency, fxRates)
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
      const synced = await catalogue.syncProduct(product, resolvedPlans.map(resolved => ({
        plan: resolved.plan, lookupKey: planHelper.planLookupKey(product, resolved.plan), unitAmountMinor: resolved.unitAmount,
        currency: resolved.currency, options: resolved.options,
      })), { behavior })
      const prices: SyncedPrice[] = []
      const syncedAt = new Date()
      for (const resolved of resolvedPlans) {
        const price = synced.prices.find(entry => entry.planSku === resolved.plan.sku)
        if (price != null) {
          prices.push({
            planSku: resolved.plan.sku, priceId: price.priceId, lookupKey: planHelper.planLookupKey(product, resolved.plan),
            currency: resolved.currency, unitAmount: resolved.unitAmount, options: resolved.options,
            ...(behavior != null ? { taxBehavior: behavior } : price.taxBehavior != null ? { taxBehavior: price.taxBehavior } : {}),
            ...(resolved.plan.recurring != null ? { interval: resolved.plan.recurring.interval } : {}),
            sourceUnitAmount: resolved.sourceUnitAmount, sourceCurrency: resolved.sourceCurrency, syncedAt,
          })
        }
      }
      if (stored != null) {
        await fpRes.update({ ...stored, hash, productId: synced.productId, prices, updatedAt: new Date() })
      } else {
        await fpRes.create({ sku: product.sku, hash, productId: synced.productId, prices, updatedAt: new Date() })
      }
      log.info('Product synced to the paygate', { sku: product.sku, plans: plans.length, paygate: paygate.id }, { event: 'payment.product.synced' })
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
    for (const paygate of paygatesOf(ctx).all()) {
      await syncProducts(paygate)
    }
  }

  return { syncProducts, syncedPlanPrices, syncPaymentProducts }
}

/** The catalogue sync of a context — one per context. */
export const productSyncOf = memoHelper.oncePer(makeProductSyncHelper)
