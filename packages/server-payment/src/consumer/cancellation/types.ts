import type { ConsumerDeclarationRecord, PaymentSubscriptionRecord } from '../../types.js'
import type { Paygate } from '../../paygate/types.js'

/** The paygate step of a declared cancellation. */
export interface CancellationHelper {
  /**
   * Schedule an ordinary cancellation at the paygate (`subscriptions.scheduleCancel`): at the period
   * end, or at a later boundary (no proration), under the idempotency key
   * `cancellation:<id>:schedule[:<attempt>]`. Recorded as a `cancel-scheduled` event; a paygate
   * without `subscriptions` records a failed one.
   */
  scheduleCancellation: (
    paygate: Paygate, declaration: ConsumerDeclarationRecord, row: PaymentSubscriptionRecord, attempt?: number,
  ) => Promise<boolean>
}
