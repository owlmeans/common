import type Stripe from 'stripe'
import type { BillingProfileView, ConsumerRegion, ConsumerRightsPolicy } from '@owlmeans/payment'

export interface CacheEntry<T> { value: T; expiresAt: number }

export type TaxOutcome = { ok: true; calculation: Stripe.Tax.Calculation } | { ok: false; code?: string }

export type FxOutcome = { currency: string; exchangeRate: number; fxFeeRate?: number } | null


export interface FxQuoteResponse {
  rates?: Record<string, {
    exchange_rate?: number
    rate_details?: { base_rate?: number; fx_fee_rate?: number; reference_rate?: number }
  }>
}

export type ConfigurationParams = Stripe.BillingPortal.ConfigurationCreateParams

export type Claim = 'ours' | 'foreign' | 'unclaimed'

export interface CheckoutOptionsFlags {
  /** The billing country is locked and the saved customer address carries it: never overwrite it. */
  locked?: boolean
  /** Adaptive Pricing is allowed on this session (the charge currency is the settlement currency). */
  adaptive?: boolean
}

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
   * Checkout keeps the saved customer address (tax follows it, nothing typed at Stripe moves it): a
   * locked profile, or a `stripe.lockCustomerCountry` pin, whose country it carries — tax-locatable.
   */
  addressLocked: boolean
  /** The address is held by `stripe.lockCustomerCountry`: the first completed purchase locks THIS country. */
  countryPinned: boolean
}

export interface StripeErrorShape {
  type?: string
  rawType?: string
  code?: string
  param?: string
  message?: string
  raw?: { type?: string, code?: string, param?: string, message?: string }
}

export interface WebhookRequest {
  original?: { rawBody?: string | Buffer }
  rawBody?: string | Buffer
  headers: Record<string, string | string[] | undefined>
}
