import { createLazyService } from '@owlmeans/context'
import { PAYMENT_OBSERVER } from './consts.js'
import type {
  CompletionObserver, Config, Context, DisputeCallback, PaymentFailedCallback, RefundCallback,
  SubscriptionCallback, TopUpCallback,
} from './types.js'

/**
 * The application's side of payment completion. Callbacks run sequentially and are awaited; a
 * throw escapes to the webhook so the paygate delivers the event again — every callback must be
 * idempotent by the `eventKey` (`externalId` for a top-up) it is handed.
 */
export const makeCompletionObserverService = (
  alias: string = PAYMENT_OBSERVER,
): CompletionObserver => {
  const topUp: TopUpCallback[] = []
  const subscription: SubscriptionCallback[] = []
  const refund: RefundCallback[] = []
  const dispute: DisputeCallback[] = []
  const paymentFailed: PaymentFailedCallback[] = []

  const run = async <E>(callbacks: Array<(event: E, ctx: never) => Promise<void>>, event: E, ctx: unknown) => {
    for (const callback of callbacks) {
      await callback(event, ctx as never)
    }
  }

  return createLazyService<CompletionObserver>(alias, {
    onTopUp: cb => { topUp.push(cb) },
    onSubscription: cb => { subscription.push(cb) },
    onRefund: cb => { refund.push(cb) },
    onDispute: cb => { dispute.push(cb) },
    onPaymentFailed: cb => { paymentFailed.push(cb) },
    propagateTopUp: async (completion, ctx) => { await run(topUp, completion, ctx) },
    propagateSubscription: async (event, ctx) => { await run(subscription, event, ctx) },
    propagateRefund: async (event, ctx) => { await run(refund, event, ctx) },
    propagateDispute: async (event, ctx) => { await run(dispute, event, ctx) },
    propagatePaymentFailed: async (event, ctx) => { await run(paymentFailed, event, ctx) },
  }, service => async () => { service.initialized = true })
}

export const appendCompletionObserver = <C extends Config, T extends Context<C>>(
  ctx: T, alias: string = PAYMENT_OBSERVER,
): T => {
  if (!ctx.hasService(alias)) ctx.registerService(makeCompletionObserverService(alias))
  return ctx
}
