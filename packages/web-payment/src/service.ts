export type CheckoutTarget = '_self' | '_blank'

/** Same-window by default so browser return/cancel state stays in one application tab. */
export const openCheckout = (url: string, target: CheckoutTarget = '_self'): void => {
  if (typeof window === 'undefined' || url === '') return
  if (target === '_self') window.location.assign(url)
  else window.open(url, target, 'noopener,noreferrer')
}

export { makePaymentService, appendPaymentService } from '@owlmeans/client-payment'
export type { PaymentService } from '@owlmeans/client-payment'
