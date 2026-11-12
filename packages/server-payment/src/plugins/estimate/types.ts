import type { PriceEstimate } from '@owlmeans/payment'
import type { PriceEstimateParams } from '../../types.js'
import type { PaygateCustomer } from '../../paygate/types.js'
import type { CacheEntry, FxOutcome, TaxOutcome } from '../types.local.js'

export interface EstimateCache {
  taxTtlMs: number
  fxTtlMs: number
  customerTtlMs: number
  tax: Map<string, CacheEntry<TaxOutcome>>
  fx: Map<string, CacheEntry<FxOutcome>>
  customer: Map<string, CacheEntry<PaygateCustomer | null>>
  inflight: Map<string, Promise<unknown>>
}

/** Price estimates of a context: the paygate's tax calculation and the local-currency line. */
export interface EstimateHelper {
  /**
   * A tax estimate (and, when the pricing policy asks for it, a local-currency conversion) for one
   * product/plan, at a billing country the request names or the entity's paygate customer does —
   * through `params.paygate`, else the first registered paygate the plan is for sale through.
   *
   * One tax calculation per distinct (paygate, currency, country, amount, tax code, behavior,
   * matching tax ids) within `cache`'s TTL, and one FX quote per distinct (currency, local currency)
   * — never more; a failed call is never cached. A paygate without `tax` answers `at-checkout`.
   */
  estimatePrice: (params: PriceEstimateParams, cache: EstimateCache) => Promise<PriceEstimate>
}
