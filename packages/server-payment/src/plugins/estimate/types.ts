import type Stripe from 'stripe'
import type { PriceEstimate } from '@owlmeans/payment'
import type { PriceEstimateParams } from '../../types.js'
import type { CacheEntry, FxOutcome, TaxOutcome } from '../types.local.js'

export interface EstimateCache {
  taxTtlMs: number
  fxTtlMs: number
  customerTtlMs: number
  tax: Map<string, CacheEntry<TaxOutcome>>
  fx: Map<string, CacheEntry<FxOutcome>>
  customer: Map<string, CacheEntry<Stripe.Customer | null>>
  inflight: Map<string, Promise<unknown>>
}

/** Price estimates of a context: Stripe Tax and the local-currency line. */
export interface EstimateHelper {
  /**
   * A Stripe Tax estimate (and, when the pricing policy asks for it, a local-currency conversion) for
   * one product/plan, at a billing country the request names or the entity's paygate customer does.
   *
   * Costs one Tax Calculation API call ($0.05) per distinct (currency, country, amount, tax code,
   * behavior, matching tax ids) within `cache`'s TTL, and one free FX Quotes call per distinct
   * (currency, local currency) — never more, and never for a rate-limit or connection error, which is
   * never cached.
   */
  estimateStripePrice: (stripe: Stripe, params: PriceEstimateParams, cache: EstimateCache) => Promise<PriceEstimate>
}
