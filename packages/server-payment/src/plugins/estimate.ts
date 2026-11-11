import { CheckoutPricingMode, currencyOfCountry, ProductError, TaxBehavior, TaxEstimateStatus, UnknownProduct, type PriceEstimate, type TaxEstimate, checkoutPricingHelper, consumerRegionHelper } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { PaymentPlan, PaymentProduct, PriceEstimateParams } from '../types.js'
import type { CacheEntry, FxOutcome, TaxOutcome } from './types.local.js'
import type { EstimateCache, EstimateHelper } from './estimate/types.js'
import type { Paygate, PaygateCustomer } from '../paygate/types.js'
import { paymentAccessOf } from '../access.js'
import { catalogueOf } from '../catalogue.js'
import { paygatesOf } from '../paygate/registry.js'

/**
 * A keyed value cached for `ttlMs`, with in-flight requests shared across concurrent callers. Only
 * a settled (resolved) outcome is cached — a thrown error (a rate limit, a dropped connection) never
 * is, so the next call simply tries again.
 */
const cached = async <T>(
  store: Map<string, CacheEntry<T>>, inflight: Map<string, Promise<unknown>>,
  key: string, ttlMs: number, factory: () => Promise<T>,
): Promise<T> => {
  const now = Date.now()
  const hit = store.get(key)
  if (hit != null && hit.expiresAt > now) {
    return hit.value
  }
  const pending = inflight.get(key) as Promise<T> | undefined
  if (pending != null) {
    return pending
  }
  const promise = factory().then(value => {
    store.set(key, { value, expiresAt: Date.now() + ttlMs })
    inflight.delete(key)
    return value
  }).catch(error => {
    inflight.delete(key)
    throw error
  })
  inflight.set(key, promise)
  return promise
}

/** The reference amount and currency of the estimate: an amount plan's default preset, else the plan's own price. */
const referenceOf = (plan: PaymentPlan): { subtotalMinor: number; currency: string } => {
  if (plan.pricingMode === CheckoutPricingMode.Amount) {
    if (plan.amountPolicy == null) throw new ProductError(`amount-policy:${plan.sku}`)
    return {
      subtotalMinor: checkoutPricingHelper.chargeAmountMinor(plan.amountPolicy.defaultMinor, plan.amountPolicy),
      currency: plan.amountPolicy.currency.toLowerCase(),
    }
  }
  return { subtotalMinor: Math.round(plan.price * 100), currency: (plan.currency ?? 'usd').toLowerCase() }
}

/** A placeholder estimate — no known tax, shown by its `status`, never by its zeroed numbers. */
const unresolvedEstimate = (status: TaxEstimateStatus, subtotalMinor: number): TaxEstimate => ({
  status, subtotalMinor, taxMinor: 0, totalMinor: subtotalMinor, scalable: false, rates: [],
})

export const makeEstimateHelper = (ctx: ApiContext): EstimateHelper => {
  const access = paymentAccessOf(ctx)

  // Customer lookup — the fallback country and the tax ids a request-given country still checks.
  const cachedCustomer = async (
    paygate: Paygate, entityId: string, cache: EstimateCache,
  ): Promise<PaygateCustomer | null> => cached(cache.customer, cache.inflight, `customer:${paygate.id}:${entityId}`, cache.customerTtlMs, async () => {
    const record = await access.paygateCustomers().byEntity(entityId, paygate.id)
    if (record == null || record.deletedAt != null) {
      return null
    }

    return await paygate.customers.retrieve(record.externalId, { taxIds: true })
  })

  /**
   * The reference amount in the currency the buyer is charged in: a recurring or quantity plan's
   * synced price in that currency (its default or an option — no paygate call), else the plan's own
   * catalogue reference. An amount plan keeps its policy currency.
   */
  const chargedReferenceOf = async (
    product: PaymentProduct, plan: PaymentPlan, chargeCurrency: string | null,
  ): Promise<{ subtotalMinor: number; currency: string }> => {
    const reference = referenceOf(plan)
    if (chargeCurrency == null || plan.pricingMode === CheckoutPricingMode.Amount || chargeCurrency === reference.currency && plan.currencyPrices == null) {
      return reference
    }
    const synced = (await access.fingerprints().bySku(product.sku))?.prices?.find(price => price.planSku === plan.sku)
    if (synced == null) {
      return reference
    }
    if (synced.currency === chargeCurrency) {
      return { subtotalMinor: synced.unitAmount, currency: chargeCurrency }
    }
    const option = synced.options.find(entry => entry.currency === chargeCurrency)

    return option != null ? { subtotalMinor: option.unitAmount, currency: chargeCurrency } : reference
  }

  // Currency: the paygate's FX quotes. A buyer's local currency is priced at the BASE rate plus the
  // paygate's own conversion fee (`price × (1 + fee)`), which a quote's fee-inclusive `exchangeRate`
  // understates; a policy declaring `adaptiveFeeRate` is estimated the way checkout prices it, one
  // without keeps the quote's rate.
  const fetchFxRate = async (
    paygate: Paygate, currency: string, localCurrency: string,
    settlementCurrency: string = currency, adaptiveFeeRate?: number,
  ): Promise<FxOutcome> => {
    const fx = paygate.fx
    if (fx == null) return null
    const settlement = settlementCurrency.toLowerCase()
    const sourceRate = settlement === currency
      ? { referenceRate: 1 }
      : await fx.quote(currency, settlement)
    if (sourceRate == null) return null
    if (localCurrency === settlement) {
      return { currency: localCurrency, exchangeRate: 1 / sourceRate.referenceRate }
    }
    const localRate = await fx.quote(localCurrency, settlement)
    if (localRate == null) return null
    const settlementPerLocal = adaptiveFeeRate != null ? localRate.baseRate / (1 + adaptiveFeeRate) : localRate.exchangeRate
    const feeRate = adaptiveFeeRate ?? localRate.fxFeeRate
    return {
      currency: localCurrency, exchangeRate: settlementPerLocal / sourceRate.referenceRate,
      ...(feeRate != null ? { fxFeeRate: feeRate } : {}),
    }
  }

  const estimatePrice = async (params: PriceEstimateParams, cache: EstimateCache): Promise<PriceEstimate> => {
    const product = await catalogueOf(ctx).findProduct(params.productSku) as PaymentProduct | null
    if (product == null) throw new UnknownProduct(params.productSku)
    const paygates = paygatesOf(ctx)
    const plans = (await access.payment().allPlans(product.sku) as PaymentPlan[])
      .filter(plan => paygates.forSale(product, plan, params.paygate).length > 0)
    const plan = params.planSku != null
      ? plans.find(item => item.sku === params.planSku)
      : plans.find(item => item.recurring != null) ?? plans[0]
    if (plan == null) throw new ProductError(params.planSku != null ? `plan:${params.planSku}` : 'plan')
    const paygate = paygates.forSale(product, plan, params.paygate)[0]

    const pricing = await access.payment().pricingPolicy()
    const behavior = pricing.tax.behavior ?? TaxBehavior.Exclusive
    const rights = await access.payment().consumerRightsPolicy()
    // A locked billing country overrides whatever the request names: a picker shows it, locked.
    const profile = rights != null ? await access.consumerRightsOf()?.profile(params.entityId) ?? null : null
    const locked = profile?.locked === true && profile.country != null

    let country = locked ? profile.country as string : params.country?.toUpperCase()
    let source: 'request' | 'customer' | 'profile' | undefined = locked ? 'profile' : country != null ? 'request' : undefined
    let matchingTaxIds: Array<{ type: string; value: string }> = []
    let exemption: 'exempt' | 'reverse' | undefined

    const customer = await cachedCustomer(paygate, params.entityId, cache)
    if (customer != null) {
      if (country == null && customer.country != null) {
        country = customer.country
        source = 'customer'
      }
      if (country != null) {
        matchingTaxIds = (customer.taxIds ?? [])
          .filter(taxId => taxId.country === country)
          .map(taxId => ({ type: taxId.type, value: taxId.value }))
        if (customer.taxExempt === 'exempt') exemption = 'exempt'
        else if (customer.taxExempt === 'reverse') exemption = 'reverse'
      }
    }

    const region = rights != null ? consumerRegionHelper.regionOf(country, rights) : null
    const settlementCurrency = (await paygate.settlementCurrency())?.toLowerCase()
    // The currency the checkout session charges: the region's (or the locked profile's) under a policy
    // with region currencies, else none forced.
    const chargeCurrency = rights != null && rights.currencies != null && Object.keys(rights.currencies).length > 0
      ? (profile?.currency ?? consumerRegionHelper.chargeCurrencyOf(region, rights, settlementCurrency ?? (plan.currency ?? 'usd'))).toLowerCase()
      : null
    const { subtotalMinor, currency } = await chargedReferenceOf(product, plan, chargeCurrency)
    const where = { ...(region != null ? { region } : {}), ...(locked ? { locked: true } : {}) }

    if (country == null) {
      return { currency, behavior, tax: unresolvedEstimate(TaxEstimateStatus.LocationRequired, subtotalMinor), ...where }
    }

    if (paygate.tax == null) {
      return { country, source, currency, behavior, tax: unresolvedEstimate(TaxEstimateStatus.AtCheckout, subtotalMinor), ...where } as PriceEstimate
    }
    const tax = paygate.tax
    const cacheKey = JSON.stringify([
      paygate.id, currency, country, subtotalMinor, product.taxCode ?? null, behavior,
      matchingTaxIds.map(id => `${id.type}:${id.value}`).sort(), exemption ?? null,
    ])
    const outcome = await cached(cache.tax, cache.inflight, `tax:${cacheKey}`, cache.taxTtlMs, async (): Promise<TaxOutcome> =>
      await tax.calculate({
        currency, amountMinor: subtotalMinor, reference: plan.sku, taxBehavior: behavior,
        ...(product.taxCode != null ? { taxCode: product.taxCode } : {}),
        country: country as string, taxIds: matchingTaxIds,
        ...(exemption != null ? { exemption } : {}),
      }))

    const estimated: TaxEstimate = outcome ?? unresolvedEstimate(TaxEstimateStatus.AtCheckout, subtotalMinor)

    const result: PriceEstimate = { country, source, currency, behavior, tax: estimated, ...where }
    // Local-currency pricing — and so a local-currency line — applies only to a session CHARGED in the
    // settlement currency; a forced region currency (exact USD) is shown as it is. An amount plan is
    // estimated in its policy currency but charged in the region's currency (converted per session,
    // `chargeAmount`), so the session's currency decides, never the reference's: a EUR-charged top-up
    // gets its local line through the same USD → settlement → local chain the session takes.
    const charged = chargeCurrency ?? currency
    const adaptive = rights?.currencies == null || charged === (settlementCurrency ?? charged)

    if (pricing.currency.estimate && pricing.currency.adaptive === true && adaptive) {
      const localCurrency = currencyOfCountry(country)
      if (localCurrency != null && localCurrency !== currency) {
        const settlement = settlementCurrency ?? currency
        // A rate that cannot be read never fails the estimate, it only drops `local`.
        const feeRate = pricing.currency.adaptiveFeeRate
        const fx = await cached(
          cache.fx, cache.inflight, `fx:${paygate.id}:${currency}:${settlement}:${localCurrency}:${feeRate ?? ''}`, cache.fxTtlMs,
          () => fetchFxRate(paygate, currency, localCurrency, settlement, feeRate),
        ).catch(() => null)
        if (fx != null) {
          result.local = { currency: fx.currency, exchangeRate: fx.exchangeRate, ...(fx.fxFeeRate != null ? { fxFeeRate: fx.fxFeeRate } : {}) }
        }
      }
    }

    return result
  }

  return { estimatePrice }
}

/** The price estimates of a context — one per context. */
export const estimateOf = memoHelper.oncePer(makeEstimateHelper)
