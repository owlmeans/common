import { createLazyService } from '@owlmeans/context'
import { PAYMENT_OBSERVER } from './consts.js'
import type {
  CancellationCallback, CompletionObserver, Config, ConsentCallback, Context, DisputeCallback,
  PaymentFailedCallback, RefundCallback, SubscriptionCallback, TopUpCallback, WithdrawalCallback,
} from './types.js'

/**
 * The application's side of payment completion. Callbacks run sequentially and are awaited; a
 * throw escapes to the webhook so the paygate delivers the event again — every callback must be
 * idempotent by the `eventKey` (`externalId` for a top-up) it is handed.
 *
 * The consumer-rights callbacks (`onConsent`, `onWithdrawal`, `onCancellation`) run after the
 * records and the paygate steps of their act; a throw is recorded as an `observers` event and
 * retried by the consumer-rights `reconcile()` — they, too, are idempotent by `eventKey`.
 */
export const makeCompletionObserverService = (
  alias: string = PAYMENT_OBSERVER,
): CompletionObserver => {
  const topUp: TopUpCallback[] = []
  const subscription: SubscriptionCallback[] = []
  const refund: RefundCallback[] = []
  const dispute: DisputeCallback[] = []
  const paymentFailed: PaymentFailedCallback[] = []
  const consent: ConsentCallback[] = []
  const withdrawal: WithdrawalCallback[] = []
  const cancellation: CancellationCallback[] = []

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
    onConsent: cb => { consent.push(cb) },
    onWithdrawal: cb => { withdrawal.push(cb) },
    onCancellation: cb => { cancellation.push(cb) },
    propagateTopUp: async (completion, ctx) => { await run(topUp, completion, ctx) },
    propagateSubscription: async (event, ctx) => { await run(subscription, event, ctx) },
    propagateRefund: async (event, ctx) => { await run(refund, event, ctx) },
    propagateDispute: async (event, ctx) => { await run(dispute, event, ctx) },
    propagatePaymentFailed: async (event, ctx) => { await run(paymentFailed, event, ctx) },
    propagateConsent: async (event, ctx) => { await run(consent, event, ctx) },
    propagateWithdrawal: async (event, ctx) => { await run(withdrawal, event, ctx) },
    propagateCancellation: async (event, ctx) => { await run(cancellation, event, ctx) },
  }, service => async () => { service.initialized = true })
}

export const appendCompletionObserver = <C extends Config, T extends Context<C>>(
  ctx: T, alias: string = PAYMENT_OBSERVER,
): T => {
  if (!ctx.hasService(alias)) ctx.registerService(makeCompletionObserverService(alias))
  return ctx
}
