import { TaxBehavior, TaxEstimateStatus, TaxType } from '@owlmeans/payment'
import type { PriceEstimate } from '@owlmeans/payment'
import type { PriceEstimateControl } from '../../src/index.js'

/** Canned `PriceEstimateControl`s for the Playwright harness — no server, no Stripe. */
export const ESTIMATE_FIXTURES: Record<string, PriceEstimateControl> = {
  pl: {
    country: 'PL', loading: false, failed: false, onCountryChange: () => {},
    estimate: {
      country: 'PL', source: 'request', currency: 'usd', behavior: TaxBehavior.Exclusive,
      tax: {
        status: TaxEstimateStatus.Taxed, subtotalMinor: 1_021, taxMinor: 235, totalMinor: 1_256,
        scalable: true, rates: [{ type: TaxType.Vat, percentage: '23', ratePpm: 230_000, country: 'PL' }],
      },
      local: { currency: 'pln', exchangeRate: 0.25, fxFeeRate: 0.02 },
    } satisfies PriceEstimate,
  },
  reverse: {
    country: 'DE', loading: false, failed: false, onCountryChange: () => {},
    estimate: {
      country: 'DE', source: 'request', currency: 'usd', behavior: TaxBehavior.Exclusive,
      tax: {
        status: TaxEstimateStatus.ReverseCharge, subtotalMinor: 1_021, taxMinor: 0, totalMinor: 1_021,
        scalable: true, rates: [],
      },
    } satisfies PriceEstimate,
  },
  'at-checkout': {
    country: 'US', loading: false, failed: false, onCountryChange: () => {},
    estimate: {
      country: 'US', source: 'request', currency: 'usd', behavior: TaxBehavior.Exclusive,
      tax: {
        status: TaxEstimateStatus.AtCheckout, subtotalMinor: 1_021, taxMinor: 0, totalMinor: 1_021,
        scalable: false, rates: [],
      },
    } satisfies PriceEstimate,
  },
  'location-required': {
    country: '', loading: false, failed: false, onCountryChange: () => {},
    estimate: {
      currency: 'usd', behavior: TaxBehavior.Exclusive,
      tax: {
        status: TaxEstimateStatus.LocationRequired, subtotalMinor: 1_021, taxMinor: 0, totalMinor: 1_021,
        scalable: false, rates: [],
      },
    } satisfies PriceEstimate,
  },
}
