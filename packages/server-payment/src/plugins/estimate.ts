import type Stripe from 'stripe'
import { CheckoutPricingMode, currencyOfCountry, ProductError, TaxBehavior, TaxEstimateStatus, TaxType, UnknownProduct, type PriceEstimate, type TaxEstimate, type TaxRateEstimate, checkoutPricingHelper, consumerRegionHelper, priceEstimateHelper } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import { STRIPE_FX_QUOTES_API_VERSION, STRIPE_PAYGATE_ALIAS } from '../consts.js'
import type { PaymentPlan, PaymentProduct, PriceEstimateParams } from '../types.js'
import { NON_SCALABLE_REASONS, TAX_TYPE_MAP } from './consts.local.js'
import type { CacheEntry, FxOutcome, TaxOutcome } from './types.local.js'
import type { EstimateCache, EstimateHelper } from './estimate/types.js'
import { fxOf } from './fx.js'
import { paymentAccessOf } from '../access.js'
import { paymentUtils } from '../utils.js'
import { catalogueOf } from '../catalogue.js'
import { planHelper } from '../plan.js'

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

// -------------------------------------------------------------------------------------------
// Tax
// -------------------------------------------------------------------------------------------

/** A duck-typed check, matching `isMissingObject` above: the installed SDK's own error classes. */
const isInvalidRequest = (error: unknown): error is { code?: string } =>
  (error as { type?: unknown } | null)?.type === 'StripeInvalidRequestError'

/** A linear percentage rate scales with the amount; a flat fee, a partial exemption, or several inclusive rates do not. */
const scalableOf = (breakdown: Stripe.Tax.Calculation.TaxBreakdown[], behavior: TaxBehavior): boolean => {
  if (breakdown.some(row => row.tax_rate_details?.rate_type === 'flat_amount')) return false
  if (breakdown.some(row => NON_SCALABLE_REASONS.has(row.taxability_reason))) return false
  if (behavior === TaxBehavior.Inclusive && breakdown.length > 1) return false
  return true
}

const statusOf = (breakdown: Stripe.Tax.Calculation.TaxBreakdown[], taxMinor: number): TaxEstimateStatus => {
  if (breakdown.some(row => row.taxability_reason === 'reverse_charge')) return TaxEstimateStatus.ReverseCharge
  if (taxMinor > 0) return TaxEstimateStatus.Taxed
  if (breakdown.some(row => row.taxability_reason === 'not_supported')) return TaxEstimateStatus.AtCheckout
  return TaxEstimateStatus.None
}

const taxTypeOf = (raw: string | null | undefined): TaxType => raw != null && raw in TAX_TYPE_MAP ? TAX_TYPE_MAP[raw] : TaxType.Tax

const ratesOf = (breakdown: Stripe.Tax.Calculation.TaxBreakdown[]): TaxRateEstimate[] => breakdown
  .filter((row): row is Stripe.Tax.Calculation.TaxBreakdown & {
    tax_rate_details: NonNullable<Stripe.Tax.Calculation.TaxBreakdown['tax_rate_details']>
  } => row.tax_rate_details != null)
  .map(row => ({
    type: taxTypeOf(row.tax_rate_details.tax_type),
    percentage: row.tax_rate_details.percentage_decimal,
    ratePpm: priceEstimateHelper.ratePpmOf(row.tax_rate_details.percentage_decimal),
    ...(row.tax_rate_details.country != null ? { country: row.tax_rate_details.country } : {}),
    ...(row.tax_rate_details.state != null ? { state: row.tax_rate_details.state } : {}),
  }))

const taxEstimateOf = (calculation: Stripe.Tax.Calculation, behavior: TaxBehavior, subtotalMinor: number): TaxEstimate => {
  const breakdown = calculation.tax_breakdown ?? []
  const taxMinor = calculation.tax_amount_exclusive + calculation.tax_amount_inclusive
  const status = statusOf(breakdown, taxMinor)

  return {
    status, subtotalMinor, taxMinor, totalMinor: calculation.amount_total,
    scalable: scalableOf(breakdown, behavior), rates: ratesOf(breakdown),
  }
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
    stripe: Stripe, entityId: string, cache: EstimateCache,
  ): Promise<Stripe.Customer | null> => cached(cache.customer, cache.inflight, `customer:${entityId}`, cache.customerTtlMs, async () => {
    const record = await access.paygateCustomers().byEntity(entityId, STRIPE_PAYGATE_ALIAS)
    if (record == null || record.deletedAt != null) {
      return null
    }
    try {
      const retrieved = await stripe.customers.retrieve(record.externalId, { expand: ['tax_ids'] })
      return (retrieved as Stripe.DeletedCustomer).deleted ? null : retrieved as Stripe.Customer
    } catch (error) {
      if (paymentUtils.isMissingObject(error)) return null
      throw error
    }
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

  // Currency: Stripe FX Quotes, a PREVIEW endpoint — see `STRIPE_FX_QUOTES_API_VERSION`.
  const fetchFxRate = async (
    stripe: Stripe, currency: string, localCurrency: string, apiVersion: string,
    settlementCurrency: string = currency,
  ): Promise<FxOutcome> => {
    const settlement = settlementCurrency.toLowerCase()
    const sourceRate = settlement === currency
      ? { referenceRate: 1 }
      : await fxOf(ctx).stripeFxRate(stripe, currency, settlement, apiVersion)
    if (sourceRate == null) return null
    if (localCurrency === settlement) {
      return { currency: localCurrency, exchangeRate: 1 / sourceRate.referenceRate }
    }
    const localRate = await fxOf(ctx).stripeFxRate(stripe, localCurrency, settlement, apiVersion)
    if (localRate == null) return null
    return {
      currency: localCurrency, exchangeRate: localRate.exchangeRate / sourceRate.referenceRate,
      ...(localRate.fxFeeRate != null ? { fxFeeRate: localRate.fxFeeRate } : {}),
    }
  }

  const estimateStripePrice = async (
    stripe: Stripe, params: PriceEstimateParams, cache: EstimateCache,
  ): Promise<PriceEstimate> => {
    const product = await catalogueOf(ctx).findProduct(params.productSku) as PaymentProduct | null
    if (product == null) throw new UnknownProduct(params.productSku)
    const plans = (await access.payment().allPlans(product.sku) as PaymentPlan[])
      .filter(plan => planHelper.isSoldThrough(product, plan, STRIPE_PAYGATE_ALIAS))
    const plan = params.planSku != null
      ? plans.find(item => item.sku === params.planSku)
      : plans.find(item => item.recurring != null) ?? plans[0]
    if (plan == null) throw new ProductError(params.planSku != null ? `plan:${params.planSku}` : 'plan')

    const pricing = await access.payment().pricingPolicy()
    const behavior = pricing.tax.behavior ?? TaxBehavior.Exclusive
    const rights = await access.payment().consumerRightsPolicy()
    // A locked billing country overrides whatever the request names: a picker shows it, locked.
    const profile = rights != null ? await access.consumerRightsOf()?.profile(params.entityId) ?? null : null
    const locked = profile?.locked === true && profile.country != null

    let country = locked ? profile.country as string : params.country?.toUpperCase()
    let source: 'request' | 'customer' | 'profile' | undefined = locked ? 'profile' : country != null ? 'request' : undefined
    let matchingTaxIds: Array<{ type: string; value: string }> = []
    let taxabilityOverride: 'customer_exempt' | 'reverse_charge' | undefined

    const customer = await cachedCustomer(stripe, params.entityId, cache)
    if (customer != null) {
      if (country == null && customer.address?.country != null) {
        country = customer.address.country
        source = 'customer'
      }
      if (country != null) {
        matchingTaxIds = (customer.tax_ids?.data ?? [])
          .filter(taxId => taxId.country === country)
          .map(taxId => ({ type: taxId.type, value: taxId.value }))
        if (customer.tax_exempt === 'exempt') taxabilityOverride = 'customer_exempt'
        else if (customer.tax_exempt === 'reverse') taxabilityOverride = 'reverse_charge'
      }
    }

    const region = rights != null ? consumerRegionHelper.regionOf(country, rights) : null
    const settlementCurrency = (await access.stripePricingConfig())?.settlementCurrency?.toLowerCase()
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

    const cacheKey = JSON.stringify([
      currency, country, subtotalMinor, product.taxCode ?? null, behavior,
      matchingTaxIds.map(id => `${id.type}:${id.value}`).sort(), taxabilityOverride ?? null,
    ])
    const outcome = await cached(cache.tax, cache.inflight, `tax:${cacheKey}`, cache.taxTtlMs, async (): Promise<TaxOutcome> => {
      try {
        const calculation = await stripe.tax.calculations.create({
          currency,
          line_items: [{
            amount: subtotalMinor, reference: plan.sku, tax_behavior: behavior,
            ...(product.taxCode != null ? { tax_code: product.taxCode } : {}),
          }],
          customer_details: {
            address: { country },
            address_source: 'billing',
            // Cast: `Stripe.TaxId.type` (the customer's saved tax id) and the Tax Calculation
            // parameter's own tax-id-type enum are independently generated from Stripe's OpenAPI
            // spec and can drift apart in this pinned SDK; every value here still came from a real
            // Stripe `TaxId` record, so it is valid at the API even where the two types disagree.
            ...(matchingTaxIds.length > 0
              ? { tax_ids: matchingTaxIds as Stripe.Tax.CalculationCreateParams.CustomerDetails['tax_ids'] }
              : {}),
            ...(taxabilityOverride != null ? { taxability_override: taxabilityOverride } : {}),
          },
        })
        return { ok: true, calculation }
      } catch (error) {
        if (isInvalidRequest(error)) return { ok: false, code: error.code }
        throw error
      }
    })

    const tax = outcome.ok
      ? taxEstimateOf(outcome.calculation, behavior, subtotalMinor)
      : unresolvedEstimate(TaxEstimateStatus.AtCheckout, subtotalMinor)

    const result: PriceEstimate = { country, source, currency, behavior, tax, ...where }
    // Adaptive Pricing — and so a local-currency line — applies only to a session CHARGED in the
    // settlement currency; a forced region currency (exact USD) is shown as it is. An amount plan is
    // estimated in its policy currency but charged in the region's currency (converted per session,
    // `chargeAmount`), so the session's currency decides, never the reference's: a EUR-charged top-up
    // gets its local line through the same USD → settlement → local chain the session takes.
    const charged = chargeCurrency ?? currency
    const adaptive = rights?.currencies == null || charged === (settlementCurrency ?? charged)

    if (pricing.currency.estimate && pricing.currency.adaptive === true && adaptive) {
      const localCurrency = currencyOfCountry(country)
      if (localCurrency != null && localCurrency !== currency) {
        const stripePricing = await access.stripePricingConfig()
        const apiVersion = stripePricing?.fxApiVersion ?? STRIPE_FX_QUOTES_API_VERSION
        const settlementCurrency = stripePricing?.settlementCurrency?.toLowerCase() ?? currency
        // A preview endpoint: unreachable or erroring never fails the estimate, it only drops `local`.
        const fx = await cached(
          cache.fx, cache.inflight, `fx:${currency}:${settlementCurrency}:${localCurrency}:${apiVersion}`, cache.fxTtlMs,
          () => fetchFxRate(stripe, currency, localCurrency, apiVersion, settlementCurrency),
        ).catch(() => null)
        if (fx != null) {
          result.local = { currency: fx.currency, exchangeRate: fx.exchangeRate, ...(fx.fxFeeRate != null ? { fxFeeRate: fx.fxFeeRate } : {}) }
        }
      }
    }

    return result
  }

  return { estimateStripePrice }
}

/** The price estimates of a context — one per context. */
export const estimateOf = memoHelper.oncePer(makeEstimateHelper)
