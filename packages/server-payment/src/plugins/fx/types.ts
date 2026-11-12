import type { Paygate } from '../../paygate/types.js'
import type { FxQuoteCache } from '../types.local.js'

export interface SettlementAmount {
  amountMinor: number
  currency: string
  sourceAmountMinor: number
  sourceCurrency: string
  referenceRate: number
}

/** Currency conversion through a paygate's FX quotes, under its settlement currency. */
export interface FxHelper {
  /**
   * A catalogue amount in the currency the buyer is charged in: unchanged — no quote — when the
   * currencies are equal; otherwise converted at the paygate's reference rate, rounded up.
   *
   * @throws PaygateError('fx-rate:<from>:<to>') when the paygate quotes no rate (or has no `fx`)
   */
  chargeAmount: (
    paygate: Paygate, sourceAmountMinor: number, sourceCurrency: string, chargeCurrency: string, cache?: FxQuoteCache,
  ) => Promise<SettlementAmount>
  /** Translate a catalogue amount into the paygate's settlement currency (unchanged when it declares none). */
  settlementAmount: (
    paygate: Paygate, sourceAmountMinor: number, sourceCurrency: string, cache?: FxQuoteCache,
  ) => Promise<SettlementAmount>
}
