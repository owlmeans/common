import { CheckoutLimitExceeded, narrowAmountPolicy } from '@owlmeans/payment'
import type { AmountNarrowing, AmountPolicyView } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { STRIPE_SESSION_TTL_MAX_SECONDS, STRIPE_SESSION_TTL_MIN_SECONDS } from '../consts.js'
import type {
  CheckoutAttempt, CheckoutNarrowInput, CheckoutPlugin, CheckoutSettled,
} from '../types.js'

export interface CheckoutPluginRegistry {
  use: (plugin: CheckoutPlugin) => void
  list: () => readonly CheckoutPlugin[]
}

/**
 * The gateway's checkout plugins, the way `ExecutionService.use` seats its own: a plugin with an
 * alias already registered replaces it in place (a layer wired twice must not answer twice), one
 * without an alias is appended.
 */
export const makeCheckoutPluginRegistry = (): CheckoutPluginRegistry => {
  const plugins: CheckoutPlugin[] = []

  return {
    use: plugin => {
      const at = plugin.alias != null ? plugins.findIndex(entry => entry.alias === plugin.alias) : -1
      if (at < 0) {
        plugins.push(plugin)
      } else {
        plugins[at] = plugin
      }
    },
    list: () => [...plugins],
  }
}

/**
 * An entity's amount policy as every plugin narrows it now — the ONE computation both
 * `gateway.amountPolicy` and checkout enforcement use, so a control and a refusal cannot disagree.
 * A plugin's error propagates: a narrowing that cannot be computed fails closed.
 */
export const narrowAmountFor = async (
  ctx: ApiContext, plugins: readonly CheckoutPlugin[], input: CheckoutNarrowInput,
): Promise<AmountPolicyView> => {
  const narrowings: AmountNarrowing[] = []
  for (const plugin of plugins) {
    if (plugin.narrow == null) {
      continue
    }
    const narrowing = await plugin.narrow(ctx, input)
    if (narrowing != null) {
      narrowings.push(narrowing)
    }
  }

  return narrowAmountPolicy(input.base, narrowings, {
    productSku: input.productSku, ...(input.planSku != null ? { planSku: input.planSku } : {}),
  })
}

/**
 * Refuse an amount the narrowed view does not allow: any amount while `blocked`, else one above
 * the narrowed maximum.
 *
 * @throws CheckoutLimitExceeded (409)
 */
export const assertAmountAllowed = (view: AmountPolicyView, amountMinor: number): void => {
  const limit = view.limit
  if (limit == null || (!limit.blocked && amountMinor <= limit.maximumMinor)) {
    return
  }
  throw new CheckoutLimitExceeded({
    reason: limit.reason ?? 'limit', maximumMinor: limit.maximumMinor, currency: limit.currency,
    ...(limit.resetsAt != null ? { resetsAt: limit.resetsAt } : {}),
  })
}

/**
 * The session lifetime: the smallest `sessionTtlSeconds` any plugin declares, clamped to Stripe's
 * 30 minutes – 24 hours; `undefined` when none declares one (Stripe's own default).
 */
export const sessionTtlOf = (plugins: readonly CheckoutPlugin[]): number | undefined => {
  const declared = plugins
    .map(plugin => plugin.sessionTtlSeconds)
    .filter((ttl): ttl is number => typeof ttl === 'number' && Number.isFinite(ttl))
  if (declared.length === 0) {
    return undefined
  }

  return Math.min(STRIPE_SESSION_TTL_MAX_SECONDS, Math.max(STRIPE_SESSION_TTL_MIN_SECONDS, Math.floor(Math.min(...declared))))
}

/** A plugin that admitted an attempt, with the reservation it holds. */
export interface Admitted {
  plugin: CheckoutPlugin
  reservationId?: string
}

/**
 * Tell plugins how a checkout ended. A plugin's error is logged, never raised: a hold carries its
 * own TTL, and the webhook that reports the outcome must not be redelivered for it.
 */
export const settleCheckout = async (
  ctx: ApiContext, plugins: readonly CheckoutPlugin[], settled: CheckoutSettled,
): Promise<void> => {
  for (const plugin of plugins) {
    if (plugin.settled == null) {
      continue
    }
    try {
      await plugin.settled(ctx, settled)
    } catch (error) {
      console.error(`[payment] checkout plugin "${plugin.alias ?? 'anonymous'}" failed to settle`, error)
    }
  }
}

/** Release what admitted plugins hold for a checkout that never became usable. */
export const releaseAdmitted = async (
  ctx: ApiContext, admitted: readonly Admitted[], attempt: CheckoutAttempt, sessionId?: string,
): Promise<void> => {
  for (const { plugin, reservationId } of admitted) {
    await settleCheckout(ctx, [plugin], {
      entityId: attempt.entityId, productSku: attempt.productSku,
      ...(attempt.planSku != null ? { planSku: attempt.planSku } : {}),
      ...(sessionId != null ? { sessionId } : {}),
      ...(reservationId != null ? { reservationId } : {}),
      ...(attempt.amountMinor != null ? { amountMinor: attempt.amountMinor } : {}),
      outcome: 'failed', at: new Date(),
    })
  }
}

/**
 * Ask every plugin to admit the attempt, in order. A veto releases what the earlier plugins
 * admitted and propagates.
 */
export const admitCheckout = async (
  ctx: ApiContext, plugins: readonly CheckoutPlugin[], attempt: CheckoutAttempt,
): Promise<Admitted[]> => {
  const admitted: Admitted[] = []
  for (const plugin of plugins) {
    if (plugin.admit == null) {
      admitted.push({ plugin })
      continue
    }
    try {
      const admission = await plugin.admit(ctx, attempt)
      admitted.push({ plugin, ...(admission?.reservationId != null ? { reservationId: admission.reservationId } : {}) })
    } catch (error) {
      await releaseAdmitted(ctx, admitted.filter(entry => entry.plugin.admit != null), attempt)
      throw error
    }
  }

  return admitted
}
