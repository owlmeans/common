import type Stripe from 'stripe'
import { PaygateError } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import { STRIPE_FX_QUOTES_API_VERSION } from '../consts.js'
import type { FxQuoteResponse } from './types.local.js'
import type { SettlementAmount, StripeFxRate, StripeFxRateCache, FxHelper } from './fx/types.js'
import { paymentAccessOf } from '../access.js'

/** Convert whole source minor units at the reference rate, rounding up so value is never lost. */
const convertMinor = (amountMinor: number, rate: number): number => {
  const converted = Math.ceil(amountMinor * rate)
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !Number.isFinite(rate) || rate <= 0
    || !Number.isSafeInteger(converted)) {
    throw new PaygateError('fx-amount')
  }
  return converted
}

export const makeFxHelper = (ctx: ApiContext): FxHelper => {
  const access = paymentAccessOf(ctx)

  const stripeFxRate = async (
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

  const chargeAmount = async (
    stripe: Stripe, sourceAmountMinor: number, sourceCurrency: string, chargeCurrency: string,
    cache?: StripeFxRateCache,
  ): Promise<SettlementAmount> => {
    const source = sourceCurrency.toLowerCase()
    const currency = chargeCurrency.toLowerCase()
    if (currency === source) {
      return { amountMinor: sourceAmountMinor, currency, sourceAmountMinor, sourceCurrency: source, referenceRate: 1 }
    }
    const apiVersion = (await access.stripePricingConfig())?.fxApiVersion ?? STRIPE_FX_QUOTES_API_VERSION
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

  const settlementAmount = async (
    stripe: Stripe, sourceAmountMinor: number, sourceCurrency: string, cache?: StripeFxRateCache,
  ): Promise<SettlementAmount> => {
    const source = sourceCurrency.toLowerCase()
    const pricing = await access.stripePricingConfig()
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

  return { stripeFxRate, chargeAmount, settlementAmount }
}

/** The FX conversion of a context — one per context. */
export const fxOf = memoHelper.oncePer(makeFxHelper)
