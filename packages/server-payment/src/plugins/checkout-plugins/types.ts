import type { AmountPolicyView } from '@owlmeans/payment'
import type { CheckoutAttempt, CheckoutNarrowInput, CheckoutPlugin, CheckoutSettled } from '../../types.js'
import type { Admitted } from '../types.js'

/** The checkout plugins' hooks, called in a context. */
export interface CheckoutPluginsHelper {
  /**
   * An entity's amount policy as every plugin narrows it now — the ONE computation both
   * `gateway.amountPolicy` and checkout enforcement use, so a control and a refusal cannot disagree.
   * A plugin's error propagates: a narrowing that cannot be computed fails closed.
   */
  narrowAmountFor: (plugins: readonly CheckoutPlugin[], input: CheckoutNarrowInput) => Promise<AmountPolicyView>
  /**
   * Tell plugins how a checkout ended. A plugin's error is logged, never raised: a hold carries its
   * own TTL, and the webhook that reports the outcome must not be redelivered for it.
   */
  settleCheckout: (plugins: readonly CheckoutPlugin[], settled: CheckoutSettled) => Promise<void>
  /** Release what admitted plugins hold for a checkout that never became usable. */
  releaseAdmitted: (admitted: readonly Admitted[], attempt: CheckoutAttempt, sessionId?: string) => Promise<void>
  /**
   * Ask every plugin to admit the attempt, in order. A veto releases what the earlier plugins
   * admitted and propagates.
   */
  admitCheckout: (plugins: readonly CheckoutPlugin[], attempt: CheckoutAttempt) => Promise<Admitted[]>
}
