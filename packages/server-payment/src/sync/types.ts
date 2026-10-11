import type Stripe from 'stripe'
import type { PlanPriceView } from '@owlmeans/payment'

/** The catalogue of a context as Stripe products and prices. */
export interface ProductSyncHelper {
  /**
   * Synchronize every product sold through Stripe, and its Stripe-sold plans, to Stripe products and
   * prices. A product whose declaration fingerprint is unchanged makes no paygate call. Free plans
   * and plans sold through no Stripe gateway are never synchronized.
   *
   * The declared `PricingPolicy.tax.behavior` (absent by default, so a price's `tax_behavior` stays
   * whatever it already was) is applied to a matching price only while it is `unspecified` — Stripe
   * forbids changing a price once set to `exclusive` or `inclusive` — and to a fresh one on creation.
   * A price carrying the OPPOSITE behavior is deactivated and replaced, same as any other mismatch.
   */
  syncStripeProducts: (stripe: Stripe) => Promise<void>
  /**
   * The prices a product's plans are charged at, per currency, as the last sync stored them — no
   * paygate call, so it works in an unmanaged process. One entry for each Price's default currency
   * (`default: true`) and one per currency option.
   */
  syncedPlanPrices: (productSku: string) => Promise<PlanPriceView[]>
  /** `syncStripeProducts` with this context's own Stripe client (the gateway's, else the configured secret). */
  syncPaymentProducts: () => Promise<void>
}
