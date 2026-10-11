import type Stripe from 'stripe'
import type { StripeBootstrapOptions } from '../types.js'

/** What brings Stripe to a deployment's declaration. */
export interface StripeBootstrapHelper {
  /**
   * Bring Stripe to what this deployment declares, each step on its own so one failing does not block
   * the others: products and prices, the customer-portal configuration, the webhook endpoint.
   *
   * The webhook URL and the owner key come from the context's gateway (`webhookService`, `owner`), so
   * every process of one deployment — the one bootstrapping at boot, a `resync`, an application's
   * forced maintenance run — computes the same URL and rows; each step is fingerprinted, so running it
   * from any of them is idempotent.
   */
  bootstrapStripe: (stripe: Stripe, opts?: StripeBootstrapOptions) => Promise<void>
}
