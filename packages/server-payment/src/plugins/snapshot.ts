import { CheckoutPricingMode } from '@owlmeans/payment'
import type { CheckoutSnapshot } from '../paygate/types.js'
import type { CheckoutSnapshotHelper } from './snapshot/types.js'

export const createCheckoutSnapshotHelper = (): CheckoutSnapshotHelper => {
  const canFulfill = (session: CheckoutSnapshot): boolean => {
    if (session.mode !== 'payment') return false
    if (session.payment === 'paid'
      && (session.amountTotalMinor !== 0 || session.metadata.pricingMode !== CheckoutPricingMode.Amount)) return true

    return (session.payment === 'not-required' || session.payment === 'paid')
      && session.status === 'complete' && session.metadata.pricingMode === CheckoutPricingMode.Amount
      && session.promotionCodes && session.amountTotalMinor === 0
      && Number.isSafeInteger(session.amountSubtotalMinor) && (session.amountSubtotalMinor ?? 0) > 0
      && session.amountDiscountMinor === session.amountSubtotalMinor
      && session.amountTaxMinor === 0
  }

  return { canFulfill }
}

export const checkoutSnapshotHelper = createCheckoutSnapshotHelper()
