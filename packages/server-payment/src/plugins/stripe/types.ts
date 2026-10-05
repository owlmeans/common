import type Stripe from 'stripe'
import type { CheckoutPlugin, CreateLinkParams } from '../../types.js'

/** Stripe Checkout of a context. */
export interface StripeCheckoutHelper {
  /**
   * A Stripe Checkout URL: an amount or quantity purchase of a consumable product, or a subscription
   * to `planSku` (else the product's first recurring plan). A free plan is never checked out.
   *
   * With a consumer-rights policy: a locked billing country overrides the declared one (another is
   * `BillingCountryLocked`); the charge currency is the profile's, else the region's; an amount
   * checkout is narrowed by the checkout plugins (`CheckoutLimitExceeded`) and charged without FX
   * when its policy currency is the charge currency; a subscription needs a fresh start request
   * bound to its plan; the terms checkbox and the legal submit texts come from the copy.
   *
   * Under `stripe.lockCustomerEmail` the session's customer carries `params.email` (required), so
   * Checkout shows it read-only.
   */
  createCheckoutLink: (stripe: Stripe, params: CreateLinkParams, plugins?: readonly CheckoutPlugin[]) => Promise<string>
}
