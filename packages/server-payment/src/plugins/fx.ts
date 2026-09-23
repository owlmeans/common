import type Stripe from 'stripe'
import { PaygateError } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { STRIPE_FX_QUOTES_API_VERSION } from '../consts.js'
import { stripePricingConfig } from '../utils.js'

interface FxQuoteResponse {
  rates?: Record<string, {
    exchange_rate?: number
    rate_details?: { base_rate?: number; fx_fee_rate?: number; reference_rate?: number }
  }>
}

export interface StripeFxRate {
  fromCurrency: string
  toCurrency: string
  /** Stripe's fee-inclusive conversion rate. */
  exchangeRate: number
  /** Market/reference rate used to translate catalogue value into settlement value. */
  referenceRate: number
  fxFeeRate?: number
}

/** One unlocked Stripe FX quote. `toCurrency` units per one `fromCurrency` unit. */
export const stripeFxRate = async (
  stripe: Stripe, fromCurrency: string, toCurrency: string, apiVersion: string,
): Promise<StripeFxRate | null> => {
  const from = fromCurrency.toLowerCase()
  const to = toCurrency.toLowerCase()
  if (from === to) return { fromCurrency: from, toCurrency: to, exchangeRate: 1, referenceRate: 1 }
  const response = await stripe.rawRequest(
    'POST', '/v1/fx_quotes',
    { to_currency: to, 'from_currencies[]': from, lock_duration: 'none' },
    { apiVersion },
  ) as Stripe.Response<FxQuoteResponse>
  const rate = response.rates?.[from]
  if (rate?.exchange_rate == null) return null
  return {
    fromCurrency: from,
    toCurrency: to,
    exchangeRate: rate.exchange_rate,
    referenceRate: rate.rate_details?.reference_rate ?? rate.rate_details?.base_rate ?? rate.exchange_rate,
    ...(rate.rate_details?.fx_fee_rate != null ? { fxFeeRate: rate.rate_details.fx_fee_rate } : {}),
  }
}

/** Convert whole source minor units at the reference rate, rounding up so value is never lost. */
export const convertMinor = (amountMinor: number, rate: number): number => {
  const converted = Math.ceil(amountMinor * rate)
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !Number.isFinite(rate) || rate <= 0
    || !Number.isSafeInteger(converted)) {
    throw new PaygateError('fx-amount')
  }
  return converted
}

export interface SettlementAmount {
  amountMinor: number
  currency: string
  sourceAmountMinor: number
  sourceCurrency: string
  referenceRate: number
}

export type StripeFxRateCache = Map<string, Promise<StripeFxRate | null>>

/**
 * A catalogue amount in the currency the buyer is charged in: unchanged — no FX call — when the
 * currencies are equal; otherwise converted at Stripe's FX reference rate, rounded up.
 */
export const chargeAmount = async (
  ctx: ApiContext, stripe: Stripe, sourceAmountMinor: number, sourceCurrency: string, chargeCurrency: string,
  cache?: StripeFxRateCache,
): Promise<SettlementAmount> => {
  const source = sourceCurrency.toLowerCase()
  const currency = chargeCurrency.toLowerCase()
  if (currency === source) {
    return { amountMinor: sourceAmountMinor, currency, sourceAmountMinor, sourceCurrency: source, referenceRate: 1 }
  }
  const apiVersion = (await stripePricingConfig(ctx))?.fxApiVersion ?? STRIPE_FX_QUOTES_API_VERSION
  const key = `${source}:${currency}:${apiVersion}`
  let pending = cache?.get(key)
  if (pending == null) {
    pending = stripeFxRate(stripe, source, currency, apiVersion)
    cache?.set(key, pending)
  }
  const quote = await pending
  if (quote == null) throw new PaygateError(`fx-rate:${source}:${currency}`)

  return {
    amountMinor: convertMinor(sourceAmountMinor, quote.referenceRate), currency,
    sourceAmountMinor, sourceCurrency: source, referenceRate: quote.referenceRate,
  }
}

/** Translate a catalogue amount into the configured Stripe settlement currency. */
export const settlementAmount = async (
  ctx: ApiContext, stripe: Stripe, sourceAmountMinor: number, sourceCurrency: string,
  cache?: StripeFxRateCache,
): Promise<SettlementAmount> => {
  const source = sourceCurrency.toLowerCase()
  const pricing = await stripePricingConfig(ctx)
  const currency = pricing?.settlementCurrency?.toLowerCase() ?? source
  if (currency === source) {
    return {
      amountMinor: sourceAmountMinor, currency, sourceAmountMinor, sourceCurrency: source, referenceRate: 1,
    }
  }
  const apiVersion = pricing?.fxApiVersion ?? STRIPE_FX_QUOTES_API_VERSION
  const key = `${source}:${currency}:${apiVersion}`
  let pending = cache?.get(key)
  if (pending == null) {
    pending = stripeFxRate(stripe, source, currency, apiVersion)
    cache?.set(key, pending)
  }
  const quote = await pending
  if (quote == null) throw new PaygateError(`fx-rate:${source}:${currency}`)
  return {
    amountMinor: convertMinor(sourceAmountMinor, quote.referenceRate), currency,
    sourceAmountMinor, sourceCurrency: source, referenceRate: quote.referenceRate,
  }
}
