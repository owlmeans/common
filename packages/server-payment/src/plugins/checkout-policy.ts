import { CheckoutLimitExceeded, type AmountPolicyView } from '@owlmeans/payment'
import type { CheckoutPlugin } from '../types.js'
import type { PaygateFeatures } from '../paygate/types.js'
import type { CheckoutPolicyHelper } from './checkout-policy/types.js'

export const createCheckoutPolicyHelper = (): CheckoutPolicyHelper => {
  const assertAmountAllowed = (view: AmountPolicyView, amountMinor: number): void => {
    const limit = view.limit
    if (limit == null || (!limit.blocked && amountMinor <= limit.maximumMinor)) {
      return
    }
    throw new CheckoutLimitExceeded({
      reason: limit.reason ?? 'limit', maximumMinor: limit.maximumMinor, currency: limit.currency,
      ...(limit.resetsAt != null ? { resetsAt: limit.resetsAt } : {}),
    })
  }

  const sessionTtlOf = (plugins: readonly CheckoutPlugin[], bounds?: PaygateFeatures['sessionTtl']): number | undefined => {
    if (bounds == null) {
      return undefined
    }
    const declared = plugins
      .map(plugin => plugin.sessionTtlSeconds)
      .filter((ttl): ttl is number => typeof ttl === 'number' && Number.isFinite(ttl))
    if (declared.length === 0) {
      return undefined
    }

    return Math.min(bounds.maxSeconds, Math.max(bounds.minSeconds, Math.floor(Math.min(...declared))))
  }

  return { assertAmountAllowed, sessionTtlOf }
}

export const checkoutPolicyHelper = createCheckoutPolicyHelper()
