import type { BillingProfileView, ConsumerRegion, ConsumerRightsPolicy, TaxEstimate } from '@owlmeans/payment'
import type { FxQuote } from '../paygate/types.js'

export interface CacheEntry<T> { value: T; expiresAt: number }

/** A cached tax answer: the estimate, or `null` when the paygate could not place the buyer. */
export type TaxOutcome = TaxEstimate | null

export type FxOutcome = { currency: string; exchangeRate: number; fxFeeRate?: number } | null

/** The quotes one run (a catalogue sync) shares, by `<from>:<to>`. */
export type FxQuoteCache = Map<string, Promise<FxQuote | null>>

/** What the consumer-rights policy makes of this checkout's buyer. */
export interface BuyerContext {
  policy: ConsumerRightsPolicy | null
  profile: BillingProfileView | null
  country?: string
  region: ConsumerRegion | null
  inScope: boolean
  language: string
  /** `null`: the policy names no region currencies — the legacy settlement behaviour. */
  chargeCurrency: string | null
  /**
   * Checkout keeps the saved customer address (tax follows it, nothing typed at the paygate moves
   * it): a locked profile, or a pinned customer country, whose country it carries — tax-locatable.
   */
  addressLocked: boolean
  /** The address is held by the paygate's customer country lock: the first completed purchase locks THIS country. */
  countryPinned: boolean
}

export interface WebhookRequest {
  original?: { rawBody?: string | Buffer }
  rawBody?: string | Buffer
  headers: Record<string, string | string[] | undefined>
}
