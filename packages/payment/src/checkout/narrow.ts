import { assertAmountCheckoutPolicy } from '../pricing.js'
import type { AmountCheckoutPolicy, AmountNarrowing, AmountPolicyView, CheckoutLimitView } from '../types.js'

export interface NarrowAmountPolicyOptions {
  productSku?: string
  planSku?: string
}

const maximumOf = (narrowing: AmountNarrowing): number =>
  Number.isFinite(narrowing.maximumMinor) ? Math.max(0, Math.floor(narrowing.maximumMinor)) : 0

/**
 * An amount policy narrowed for one entity — the one computation the server's refusal and the
 * dialog's control share, so a disabled control and a refusal cannot disagree.
 *
 * - The maximum is the smallest of the base maximum and every narrowing's; the reason, reset and
 *   remaining come from the narrowing that set it (the first on a tie).
 * - Presets above the maximum are dropped; the default is clamped into `[minimum, maximum]`.
 * - `limit` is `null` when no narrowing lowered the base maximum.
 * - `blocked` (`limit.maximumMinor < base.minimumMinor`) means NO amount may be bought now. The
 *   returned `policy` then stays a VALID policy pinned to the minimum (maximum = default =
 *   minimum, no presets above it), so a validator never throws on it; the UI disables the input
 *   and the confirm button on `limit.blocked`, and the server refuses every amount with
 *   `CheckoutLimitExceeded` — neither may read the pinned policy as "the minimum is allowed".
 *
 * @throws PaymentError (`checkout-policy:*`) when the base policy itself is invalid.
 */
export const narrowAmountPolicy = (
  base: AmountCheckoutPolicy, narrowings: AmountNarrowing[], opts: NarrowAmountPolicyOptions = {},
): AmountPolicyView => {
  assertAmountCheckoutPolicy(base)
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

  return { policy: assertAmountCheckoutPolicy(policy), limit }
}

/** Whether an amount may be bought under a narrowed view: never when blocked. */
export const amountAllowed = (view: AmountPolicyView, amountMinor: number): boolean =>
  view.limit?.blocked !== true && Number.isSafeInteger(amountMinor)
  && amountMinor >= view.policy.minimumMinor && amountMinor <= view.policy.maximumMinor
