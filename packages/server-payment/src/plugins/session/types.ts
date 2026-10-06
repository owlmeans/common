import type Stripe from 'stripe'
import type { TaxBehavior } from '@owlmeans/payment'
import type { PaymentPlan, PaymentProduct } from '../../types.js'

/** The parts of a Stripe Checkout Session read from a plan or an answer alone — pure. */
export interface StripeSessionHelper {
  /** The line item of an amount checkout, its pre-tax charge and its currency. @throws ProductError */
  amountCheckoutLineItem: (
    product: PaymentProduct, plan: PaymentPlan, amountMinor: number, behavior?: TaxBehavior,
  ) => { lineItem: Stripe.Checkout.SessionCreateParams.LineItem; chargeMinor: number; currency: string }
  /** The adjustable-quantity line item of a quantity checkout. */
  quantityCheckoutLineItem: (
    price: Stripe.Price, policy: { minimum: number; maximum: number; default: number },
  ) => Stripe.Checkout.SessionCreateParams.LineItem
  /**
   * Whether Stripe Tax can calculate on a saved address alone — Checkout refuses a session that keeps
   * the saved address (`customer_update.address: 'never'`) when it cannot.
   */
  isTaxLocatable: (address: Stripe.Address | null | undefined) => boolean
  /**
   * Stripe refuses `consent_collection.terms_of_service` while the account has no terms-of-service URL
   * in its Dashboard (Settings → Public details): an `invalid_request_error` on the param
   * `consent_collection[terms_of_service]` saying "You cannot collect consent to your terms of service
   * unless a URL is set in the Stripe Dashboard …". Matched on the param with a terms message, or on
   * the message alone; any other error type never matches.
   */
  isMissingTermsUrl: (error: unknown) => boolean
}
