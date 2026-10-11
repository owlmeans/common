import type Stripe from 'stripe'

export interface StripeFxRate {
  fromCurrency: string
  toCurrency: string
  /** Stripe's fee-inclusive conversion rate (`base_rate × (1 − fx_fee_rate)`). */
  exchangeRate: number
  /** The rate before any fee (Stripe's `base_rate`; derived from `exchangeRate` and `fxFeeRate` when absent). */
  baseRate: number
  /** Market/reference rate used to translate catalogue value into settlement value. */
  referenceRate: number
  fxFeeRate?: number
}

export interface SettlementAmount {
  amountMinor: number
  currency: string
  sourceAmountMinor: number
  sourceCurrency: string
  referenceRate: number
}

export type StripeFxRateCache = Map<string, Promise<StripeFxRate | null>>

/** Currency conversion through Stripe's FX Quotes, under a context's pricing settings. */
export interface FxHelper {
  /** One unlocked Stripe FX quote. `toCurrency` units per one `fromCurrency` unit. */
  stripeFxRate: (stripe: Stripe, fromCurrency: string, toCurrency: string, apiVersion: string) => Promise<StripeFxRate | null>
  /**
   * A catalogue amount in the currency the buyer is charged in: unchanged — no FX call — when the
   * currencies are equal; otherwise converted at Stripe's FX reference rate, rounded up.
   */
  chargeAmount: (
    stripe: Stripe, sourceAmountMinor: number, sourceCurrency: string, chargeCurrency: string, cache?: StripeFxRateCache,
  ) => Promise<SettlementAmount>
  /** Translate a catalogue amount into the configured Stripe settlement currency. */
  settlementAmount: (
    stripe: Stripe, sourceAmountMinor: number, sourceCurrency: string, cache?: StripeFxRateCache,
  ) => Promise<SettlementAmount>
}
