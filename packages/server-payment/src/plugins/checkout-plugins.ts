import { narrowAmountPolicy, type AmountNarrowing, type AmountPolicyView } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { CheckoutAttempt, CheckoutNarrowInput, CheckoutPlugin, CheckoutSettled } from '../types.js'
import { log } from '../log.js'
import type { Admitted } from './types.js'
import type { CheckoutPluginsHelper } from './checkout-plugins/types.js'
import { checkoutPolicyHelper } from './checkout-policy.js'

export const makeCheckoutPluginsHelper = (ctx: ApiContext): CheckoutPluginsHelper => {
  const narrowAmountFor = async (
    plugins: readonly CheckoutPlugin[], input: CheckoutNarrowInput,
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

  const settleCheckout = async (plugins: readonly CheckoutPlugin[], settled: CheckoutSettled): Promise<void> => {
    for (const plugin of plugins) {
      if (plugin.settled == null) {
        continue
      }
      try {
        await plugin.settled(ctx, settled)
      } catch (error) {
        log.error('Checkout plugin failed to settle', { plugin: plugin.alias ?? 'anonymous', error })
      }
    }
  }

  const releaseAdmitted = async (
    admitted: readonly Admitted[], attempt: CheckoutAttempt, sessionId?: string,
  ): Promise<void> => {
    for (const { plugin, reservationId } of admitted) {
      await settleCheckout([plugin], {
        entityId: attempt.entityId, productSku: attempt.productSku,
        ...(attempt.planSku != null ? { planSku: attempt.planSku } : {}),
        ...(sessionId != null ? { sessionId } : {}),
        ...(reservationId != null ? { reservationId } : {}),
        ...(attempt.amountMinor != null ? { amountMinor: attempt.amountMinor } : {}),
        outcome: 'failed', at: new Date(),
      })
    }
  }

  const admitCheckout = async (plugins: readonly CheckoutPlugin[], attempt: CheckoutAttempt): Promise<Admitted[]> => {
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
        await releaseAdmitted(admitted.filter(entry => entry.plugin.admit != null), attempt)
        throw error
      }
    }

    return admitted
  }

  return { narrowAmountFor, settleCheckout, releaseAdmitted, admitCheckout }
}

/** The checkout plugin calls of a context — one per context. */
export const checkoutPluginsOf = memoHelper.oncePer(makeCheckoutPluginsHelper)

/** @deprecated compat:factory-refactor — use `checkoutPluginsOf(ctx).narrowAmountFor(…)` */
export const narrowAmountFor = async (
  ctx: ApiContext, plugins: readonly CheckoutPlugin[], input: CheckoutNarrowInput,
): Promise<AmountPolicyView> => await checkoutPluginsOf(ctx).narrowAmountFor(plugins, input)

/** @deprecated compat:factory-refactor — use `checkoutPolicyHelper.assertAmountAllowed(…)` */
export const assertAmountAllowed = (view: AmountPolicyView, amountMinor: number): void =>
  checkoutPolicyHelper.assertAmountAllowed(view, amountMinor)
