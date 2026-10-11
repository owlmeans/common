import type { CommitOptions, PaymentSubscriptionRecord, PropagatedState, SubscriptionChange } from '../types.js'

/** How a subscription row's change is classified and keyed — pure, no store. */
export interface SubscriptionHelper {
  /** The inputs classification compares. */
  propagatedStateOf: (record: PaymentSubscriptionRecord, renewedInvoiceId?: string) => PropagatedState
  /**
   * What one subscription change means — the first rule that matches:
   * `created` (first entitling state ever propagated), `canceled`, `paused`, `resumed`,
   * `upgraded`/`downgraded` (plan change by rank; equal rank reads as an upgrade),
   * `cancel-scheduled`, `cancel-undone`, `renewed` (once per invoice), `past-due`, `suspended`,
   * `trial-ending`; otherwise nothing an observer is told about.
   */
  classifySubscriptionChange: (
    previous: PropagatedState | null, current: PaymentSubscriptionRecord, opts?: CommitOptions,
  ) => SubscriptionChange | null
  /** The idempotency key a consumer keys the side effect of a change by. */
  subscriptionEventKey: (record: PaymentSubscriptionRecord, change: SubscriptionChange, opts?: CommitOptions) => string
  /** Whether a row's stored state changed in a field that matters. */
  materiallyDiffers: (previous: PaymentSubscriptionRecord, next: PaymentSubscriptionRecord) => boolean
  /** Whether a row's classification inputs differ from what was last propagated. */
  stateDiffers: (state: PropagatedState, record: PaymentSubscriptionRecord) => boolean
}
