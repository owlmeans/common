import type Stripe from 'stripe'
import { ProductError, TaxBehavior, checkoutPricingHelper } from '@owlmeans/payment'
import type { PaymentPlan, PaymentProduct } from '../types.js'
import { NEEDS_POSTAL_CODE, NEEDS_POSTAL_CODE_OR_STATE } from './consts.local.js'
import type { StripeErrorShape } from './types.local.js'
import type { StripeSessionHelper } from './session/types.js'

export const createStripeSessionHelper = (): StripeSessionHelper => {
  const amountCheckoutLineItem = (
    product: PaymentProduct, plan: PaymentPlan, amountMinor: number, behavior: TaxBehavior = TaxBehavior.Exclusive,
  ): { lineItem: Stripe.Checkout.SessionCreateParams.LineItem; chargeMinor: number; currency: string } => {
    if (plan.amountPolicy == null) throw new ProductError(`amount-policy:${plan.sku}`)
    checkoutPricingHelper.assertCheckoutAmount(plan.amountPolicy, amountMinor)
    const chargeMinor = checkoutPricingHelper.chargeAmountMinor(amountMinor, plan.amountPolicy)
    const currency = plan.amountPolicy.currency.toLowerCase()
    return {
      lineItem: {
        price_data: {
          product: product.sku, currency, unit_amount: chargeMinor, tax_behavior: behavior,
        },
        quantity: 1,
      },
      chargeMinor,
      currency,
    }
  }

  const quantityCheckoutLineItem = (
    price: Stripe.Price, policy: { minimum: number; maximum: number; default: number },
  ): Stripe.Checkout.SessionCreateParams.LineItem => ({
    price: price.id,
    adjustable_quantity: { enabled: true, minimum: policy.minimum, maximum: policy.maximum },
    quantity: policy.default,
  })

  const present = (value: string | null | undefined): boolean => value != null && value.trim() !== ''

  const isTaxLocatable = (address: Stripe.Address | null | undefined): boolean => {
    const country = address?.country?.toUpperCase()
    if (country == null || country === '') {
      return false
    }
    if (NEEDS_POSTAL_CODE.has(country)) {
      return present(address?.postal_code)
    }
    if (NEEDS_POSTAL_CODE_OR_STATE.has(country)) {
      return present(address?.postal_code) || present(address?.state)
    }

    return true
  }

  const isMissingTermsUrl = (error: unknown): boolean => {
    if (error == null || typeof error !== 'object') {
      return false
    }
    const typed = error as StripeErrorShape
    const kind = typed.rawType ?? typed.raw?.type ?? typed.type
    if (kind != null && kind !== 'invalid_request_error' && kind !== 'StripeInvalidRequestError') {
      return false
    }
    const param = (typed.param ?? typed.raw?.param ?? '').replace(/\s/g, '')
    const message = typed.message ?? typed.raw?.message ?? ''
    const aboutTerms = /terms of service/i.test(message)
    const onTermsParam = /^consent_collection(\[|\.)terms_of_service\]?$/.test(param)

    return (onTermsParam && aboutTerms) || (aboutTerms && /\burl\b/i.test(message) && /dashboard/i.test(message))
  }

  return { amountCheckoutLineItem, quantityCheckoutLineItem, isTaxLocatable, isMissingTermsUrl }
}

export const stripeSessionHelper = createStripeSessionHelper()
