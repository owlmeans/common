import type Stripe from 'stripe'
import type { ConsumerDeclarationRecord, PaymentSubscriptionRecord } from '../../types.js'

/** The paygate step of a declared cancellation. */
export interface CancellationHelper {
  /**
   * Schedule an ordinary cancellation at the paygate: at the period end (`cancel_at_period_end`), or
   * at a later boundary (`cancel_at`, no proration). Recorded as a `cancel-scheduled` event.
   */
  scheduleCancellation: (
    stripe: Stripe, declaration: ConsumerDeclarationRecord, row: PaymentSubscriptionRecord, attempt?: number,
  ) => Promise<boolean>
}
