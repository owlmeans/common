import type Stripe from 'stripe'
import {
  chargeAmountMinor, CheckoutPricingMode, currencyOfCountry, ProductError, ratePpmOf, TaxBehavior,
  TaxEstimateStatus, TaxType, UnknownProduct,
} from '@owlmeans/payment'
import type { PriceEstimate, TaxEstimate, TaxRateEstimate } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { STRIPE_FX_QUOTES_API_VERSION, STRIPE_PAYGATE_ALIAS } from '../consts.js'
import { findProduct } from '../plan.js'
import { isSoldThrough } from '../sync.js'
import { isMissingObject, paygateCustomers, payment, stripePricingConfig } from '../utils.js'
import type { PaymentPlan, PaymentProduct, PriceEstimateParams } from '../types.js'

// -------------------------------------------------------------------------------------------
// Cache — one instance per gateway service, never module-level (a test builds many contexts in
// one process, and a module-level cache would make "no Stripe call" assertions order-dependent).
// -------------------------------------------------------------------------------------------

interface CacheEntry<T> { value: T; expiresAt: number }

export interface EstimateCache {
  taxTtlMs: number
  fxTtlMs: number
  customerTtlMs: number
  tax: Map<string, CacheEntry<TaxOutcome>>
  fx: Map<string, CacheEntry<FxOutcome>>
  customer: Map<string, CacheEntry<Stripe.Customer | null>>
  inflight: Map<string, Promise<unknown>>
}

/** @param taxTtlMs default 24h; @param fxTtlMs default 1h; @param customerTtlMs default 5min. */
export const makeEstimateCache = (
  taxTtlMs: number = 24 * 60 * 60 * 1_000, fxTtlMs: number = 60 * 60 * 1_000,
  customerTtlMs: number = 5 * 60 * 1_000,
): EstimateCache => ({
  taxTtlMs, fxTtlMs, customerTtlMs, tax: new Map(), fx: new Map(), customer: new Map(), inflight: new Map(),
})

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
// Customer lookup — the fallback country and the tax ids a request-given country still checks.
// -------------------------------------------------------------------------------------------

const cachedCustomer = async (
  ctx: ApiContext, stripe: Stripe, entityId: string, cache: EstimateCache,
): Promise<Stripe.Customer | null> => cached(cache.customer, cache.inflight, `customer:${entityId}`, cache.customerTtlMs, async () => {
  const record = await paygateCustomers(ctx).byEntity(entityId, STRIPE_PAYGATE_ALIAS)
  if (record == null || record.deletedAt != null) {
    return null
  }
  try {
    const retrieved = await stripe.customers.retrieve(record.externalId, { expand: ['tax_ids'] })
    return (retrieved as Stripe.DeletedCustomer).deleted ? null : retrieved as Stripe.Customer
  } catch (error) {
    if (isMissingObject(error)) return null
    throw error
  }
})

// -------------------------------------------------------------------------------------------
// Tax
// -------------------------------------------------------------------------------------------

type TaxOutcome = { ok: true; calculation: Stripe.Tax.Calculation } | { ok: false; code?: string }

/** A duck-typed check, matching `isMissingObject` above: the installed SDK's own error classes. */
const isInvalidRequest = (error: unknown): error is { code?: string } =>
  (error as { type?: unknown } | null)?.type === 'StripeInvalidRequestError'

const NON_SCALABLE_REASONS = new Set([
  'portion_product_exempt', 'portion_reduced_rated', 'portion_standard_rated', 'taxable_basis_reduced',
  'proportionally_rated',
])

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

const TAX_TYPE_MAP: Readonly<Record<string, TaxType>> = Object.freeze({
  vat: TaxType.Vat, gst: TaxType.Gst, sales_tax: TaxType.SalesTax,
})

const taxTypeOf = (raw: string | null | undefined): TaxType => raw != null && raw in TAX_TYPE_MAP ? TAX_TYPE_MAP[raw] : TaxType.Tax

const ratesOf = (breakdown: Stripe.Tax.Calculation.TaxBreakdown[]): TaxRateEstimate[] => breakdown
  .filter((row): row is Stripe.Tax.Calculation.TaxBreakdown & {
    tax_rate_details: NonNullable<Stripe.Tax.Calculation.TaxBreakdown['tax_rate_details']>
  } => row.tax_rate_details != null)
  .map(row => ({
    type: taxTypeOf(row.tax_rate_details.tax_type),
    percentage: row.tax_rate_details.percentage_decimal,
    ratePpm: ratePpmOf(row.tax_rate_details.percentage_decimal),
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
      subtotalMinor: chargeAmountMinor(plan.amountPolicy.defaultMinor, plan.amountPolicy),
      currency: plan.amountPolicy.currency.toLowerCase(),
    }
  }
  return { subtotalMinor: Math.round(plan.price * 100), currency: (plan.currency ?? 'usd').toLowerCase() }
}

/** A placeholder estimate — no known tax, shown by its `status`, never by its zeroed numbers. */
const unresolvedEstimate = (status: TaxEstimateStatus, subtotalMinor: number): TaxEstimate => ({
  status, subtotalMinor, taxMinor: 0, totalMinor: subtotalMinor, scalable: false, rates: [],
})

// -------------------------------------------------------------------------------------------
// Currency (Stripe FX Quotes, a PREVIEW endpoint — see `STRIPE_FX_QUOTES_API_VERSION`)
// -------------------------------------------------------------------------------------------

interface FxQuoteResponse {
  rates?: Record<string, { exchange_rate?: number; rate_details?: { fx_fee_rate?: number } }>
}

type FxOutcome = { currency: string; exchangeRate: number; fxFeeRate?: number } | null

const fetchFxRate = async (
  stripe: Stripe, currency: string, localCurrency: string, apiVersion: string,
): Promise<FxOutcome> => {
  const response = await stripe.rawRequest(
    'POST', '/v1/fx_quotes',
    { to_currency: currency, 'from_currencies[]': localCurrency, lock_duration: 'none' },
    { apiVersion },
  ) as Stripe.Response<FxQuoteResponse>
  const rate = response.rates?.[localCurrency]
  if (rate?.exchange_rate == null) {
    return null
  }
  return {
    currency: localCurrency, exchangeRate: rate.exchange_rate,
    ...(rate.rate_details?.fx_fee_rate != null ? { fxFeeRate: rate.rate_details.fx_fee_rate } : {}),
  }
}

// -------------------------------------------------------------------------------------------

/**
 * A Stripe Tax estimate (and, when the pricing policy asks for it, a local-currency conversion) for
 * one product/plan, at a billing country the request names or the entity's paygate customer does.
 *
 * Costs one Tax Calculation API call ($0.05) per distinct (currency, country, amount, tax code,
 * behavior, matching tax ids) within `cache`'s TTL, and one free FX Quotes call per distinct
 * (currency, local currency) — never more, and never for a rate-limit or connection error, which is
 * never cached.
 */
export const estimateStripePrice = async (
  ctx: ApiContext, stripe: Stripe, params: PriceEstimateParams, cache: EstimateCache,
): Promise<PriceEstimate> => {
  const product = await findProduct(ctx, params.productSku) as PaymentProduct | null
  if (product == null) throw new UnknownProduct(params.productSku)
  const plans = (await payment(ctx).allPlans(product.sku) as PaymentPlan[])
    .filter(plan => isSoldThrough(product, plan, STRIPE_PAYGATE_ALIAS))
  const plan = params.planSku != null
    ? plans.find(item => item.sku === params.planSku)
    : plans.find(item => item.recurring != null) ?? plans[0]
  if (plan == null) throw new ProductError(params.planSku != null ? `plan:${params.planSku}` : 'plan')

  const pricing = await payment(ctx).pricingPolicy()
  const behavior = pricing.tax.behavior ?? TaxBehavior.Exclusive
  const { subtotalMinor, currency } = referenceOf(plan)

  let country = params.country?.toUpperCase()
  let source: 'request' | 'customer' | undefined = country != null ? 'request' : undefined
  let matchingTaxIds: Array<{ type: string; value: string }> = []
  let taxabilityOverride: 'customer_exempt' | 'reverse_charge' | undefined

  const customer = await cachedCustomer(ctx, stripe, params.entityId, cache)
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

  if (country == null) {
    return { currency, behavior, tax: unresolvedEstimate(TaxEstimateStatus.LocationRequired, subtotalMinor) }
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

  const result: PriceEstimate = { country, source, currency, behavior, tax }

  if (pricing.currency.estimate && pricing.currency.adaptive === true) {
    const localCurrency = currencyOfCountry(country)
    if (localCurrency != null && localCurrency !== currency) {
      const apiVersion = (await stripePricingConfig(ctx))?.fxApiVersion ?? STRIPE_FX_QUOTES_API_VERSION
      // A preview endpoint: unreachable or erroring never fails the estimate, it only drops `local`.
      const fx = await cached(
        cache.fx, cache.inflight, `fx:${currency}:${localCurrency}:${apiVersion}`, cache.fxTtlMs,
        () => fetchFxRate(stripe, currency, localCurrency, apiVersion),
      ).catch(() => null)
      if (fx != null) {
        result.local = { currency: fx.currency, exchangeRate: fx.exchangeRate, ...(fx.fxFeeRate != null ? { fxFeeRate: fx.fxFeeRate } : {}) }
      }
    }
  }

  return result
}
