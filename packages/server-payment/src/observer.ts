import { createLazyService } from '@owlmeans/context'
import { PAYMENT_OBSERVER } from './consts.js'
import type { CompletionObserver, Config, Context, SubscriptionCallback, TopUpCallback } from './types.js'

export const makeCompletionObserverService = (
  alias: string = PAYMENT_OBSERVER,
): CompletionObserver => {
  const topUpCallbacks: TopUpCallback[] = []
  const subscriptionCallbacks: SubscriptionCallback[] = []
  return createLazyService<CompletionObserver>(alias, {
    onTopUp: cb => { topUpCallbacks.push(cb) },
    onSubscription: cb => { subscriptionCallbacks.push(cb) },
    propagateTopUp: async (completion, ctx) => {
      for (const callback of topUpCallbacks) await callback(completion, ctx)
    },
    propagateSubscription: async (completion, ctx) => {
      for (const callback of subscriptionCallbacks) await callback(completion, ctx)
    },
  }, service => async () => { service.initialized = true })
}

export const appendCompletionObserver = <C extends Config, T extends Context<C>>(
  ctx: T, alias: string = PAYMENT_OBSERVER,
): T => {
  if (!ctx.hasService(alias)) ctx.registerService(makeCompletionObserverService(alias))
  return ctx
}
