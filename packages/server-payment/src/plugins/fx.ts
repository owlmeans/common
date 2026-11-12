import { PaygateError } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { FxQuote, Paygate } from '../paygate/types.js'
import type { FxQuoteCache } from './types.local.js'
import type { SettlementAmount, FxHelper } from './fx/types.js'

/** Convert whole source minor units at the reference rate, rounding up so value is never lost. */
const convertMinor = (amountMinor: number, rate: number): number => {
  const converted = Math.ceil(amountMinor * rate)
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !Number.isFinite(rate) || rate <= 0
    || !Number.isSafeInteger(converted)) {
    throw new PaygateError('fx-amount')
  }
  return converted
}

export const makeFxHelper = (_ctx: ApiContext): FxHelper => {
  /** One quote per (from, to) within a run that shares `cache`; a paygate without `fx`, or without a rate, refuses. */
  const quoteOf = async (paygate: Paygate, from: string, to: string, cache?: FxQuoteCache): Promise<FxQuote> => {
    const key = `${from}:${to}`
    let pending = cache?.get(key)
    if (pending == null) {
      pending = paygate.fx != null ? paygate.fx.quote(from, to) : Promise.resolve(null)
      cache?.set(key, pending)
    }
    const quote = await pending
    if (quote == null) throw new PaygateError(`fx-rate:${from}:${to}`)

    return quote
  }

  const converted = async (
    paygate: Paygate, sourceAmountMinor: number, source: string, currency: string, cache?: FxQuoteCache,
  ): Promise<SettlementAmount> => {
    if (currency === source) {
      return { amountMinor: sourceAmountMinor, currency, sourceAmountMinor, sourceCurrency: source, referenceRate: 1 }
    }
    const quote = await quoteOf(paygate, source, currency, cache)

    return {
      amountMinor: convertMinor(sourceAmountMinor, quote.referenceRate), currency,
      sourceAmountMinor, sourceCurrency: source, referenceRate: quote.referenceRate,
    }
  }

  const chargeAmount = async (
    paygate: Paygate, sourceAmountMinor: number, sourceCurrency: string, chargeCurrency: string, cache?: FxQuoteCache,
  ): Promise<SettlementAmount> =>
    await converted(paygate, sourceAmountMinor, sourceCurrency.toLowerCase(), chargeCurrency.toLowerCase(), cache)

  const settlementAmount = async (
    paygate: Paygate, sourceAmountMinor: number, sourceCurrency: string, cache?: FxQuoteCache,
  ): Promise<SettlementAmount> => {
    const source = sourceCurrency.toLowerCase()
    const currency = (await paygate.settlementCurrency())?.toLowerCase() ?? source

    return await converted(paygate, sourceAmountMinor, source, currency, cache)
  }

  return { chargeAmount, settlementAmount }
}

/** The FX conversion of a context — one per context. */
export const fxOf = memoHelper.oncePer(makeFxHelper)
