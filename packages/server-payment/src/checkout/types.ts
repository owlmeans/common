import type { CheckoutPlugin, CreateLinkParams } from '../types.js'

/** The checkout of a context, through any registered paygate. */
export interface CheckoutHelper {
  /**
   * A paygate checkout URL: an amount or quantity purchase of a consumable product, or a subscription
   * to `planSku` (else the product's first recurring plan). The paygate is `params.paygate`, else the
   * first registered one the plan is for sale through (`paygatesOf(ctx).forSale`); a plan no paygate
   * sells is refused (`ProductError('plan:<sku>')`). A free plan is never checked out.
   *
   * With a consumer-rights policy: a locked billing country overrides the declared one (another is
   * `BillingCountryLocked`); the charge currency is the profile's, else the region's; an amount
   * checkout is narrowed by the checkout plugins (`CheckoutLimitExceeded`) and charged without FX
   * when its policy currency is the charge currency; a subscription needs a fresh start request
   * bound to its plan; the terms checkbox and the legal submit texts come from the copy.
   *
   * Under the paygate's customer e-mail lock the session's customer carries `params.email`
   * (required, else `PaygateError('customer-email')`), so the paygate shows it read-only.
   */
  createCheckoutLink: (params: CreateLinkParams, plugins?: readonly CheckoutPlugin[]) => Promise<string>
}
