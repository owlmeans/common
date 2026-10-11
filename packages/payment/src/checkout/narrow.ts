import { checkoutPricingHelper } from '../pricing.js'
import type { AmountCheckoutPolicy, AmountNarrowing, AmountPolicyView, CheckoutLimitView } from '../types.js'
import type { AmountNarrowingHelper } from './narrow/types.js'
import type { NarrowAmountPolicyOptions } from './types.js'

export const createAmountNarrowingHelper = (): AmountNarrowingHelper => {
  const maximumOf = (narrowing: AmountNarrowing): number =>
    Number.isFinite(narrowing.maximumMinor) ? Math.max(0, Math.floor(narrowing.maximumMinor)) : 0

  const narrowAmountPolicy = (
    base: AmountCheckoutPolicy, narrowings: AmountNarrowing[], opts: NarrowAmountPolicyOptions = {},
  ): AmountPolicyView => {
    checkoutPricingHelper.assertAmountCheckoutPolicy(base)
    let setter: AmountNarrowing | null = null
    let maximum = base.maximumMinor
    for (const narrowing of narrowings) {
      const candidate = maximumOf(narrowing)
      if (candidate < maximum) {
        maximum = candidate
        setter = narrowing
      }
    }
    if (setter == null) {
      return { policy: base, limit: null }
    }

    const blocked = maximum < base.minimumMinor
    const ceiling = blocked ? base.minimumMinor : maximum
    const policy: AmountCheckoutPolicy = {
      ...base,
      maximumMinor: ceiling,
      defaultMinor: Math.min(Math.max(base.defaultMinor, base.minimumMinor), ceiling),
      presetsMinor: base.presetsMinor.filter(preset => preset <= ceiling),
    }
    const limit: CheckoutLimitView = {
      productSku: opts.productSku ?? '',
      ...(opts.planSku != null ? { planSku: opts.planSku } : {}),
      currency: base.currency,
      minimumMinor: base.minimumMinor,
      maximumMinor: maximum,
      narrowed: true,
      blocked,
      reason: setter.reason,
      ...(setter.resetsAt != null ? { resetsAt: setter.resetsAt } : {}),
      ...(setter.remainingMinor != null ? { remainingMinor: setter.remainingMinor } : {}),
    }

    return { policy: checkoutPricingHelper.assertAmountCheckoutPolicy(policy), limit }
  }

  const amountAllowed = (view: AmountPolicyView, amountMinor: number): boolean =>
    view.limit?.blocked !== true && Number.isSafeInteger(amountMinor)
    && amountMinor >= view.policy.minimumMinor && amountMinor <= view.policy.maximumMinor

  return { narrowAmountPolicy, amountAllowed }
}

export const amountNarrowingHelper = createAmountNarrowingHelper()

/** @deprecated compat:factory-refactor — use `amountNarrowingHelper.narrowAmountPolicy(…)` */
export const narrowAmountPolicy = (
  base: AmountCheckoutPolicy, narrowings: AmountNarrowing[], opts?: NarrowAmountPolicyOptions,
): AmountPolicyView => amountNarrowingHelper.narrowAmountPolicy(base, narrowings, opts)
