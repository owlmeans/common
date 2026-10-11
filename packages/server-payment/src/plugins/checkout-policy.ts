import { CheckoutLimitExceeded, type AmountPolicyView } from '@owlmeans/payment'
import { STRIPE_SESSION_TTL_MAX_SECONDS, STRIPE_SESSION_TTL_MIN_SECONDS } from '../consts.js'
import type { CheckoutPlugin } from '../types.js'
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

  const sessionTtlOf = (plugins: readonly CheckoutPlugin[]): number | undefined => {
    const declared = plugins
      .map(plugin => plugin.sessionTtlSeconds)
      .filter((ttl): ttl is number => typeof ttl === 'number' && Number.isFinite(ttl))
    if (declared.length === 0) {
      return undefined
    }

    return Math.min(
      STRIPE_SESSION_TTL_MAX_SECONDS, Math.max(STRIPE_SESSION_TTL_MIN_SECONDS, Math.floor(Math.min(...declared))),
    )
  }

  return { assertAmountAllowed, sessionTtlOf }
}

export const checkoutPolicyHelper = createCheckoutPolicyHelper()
