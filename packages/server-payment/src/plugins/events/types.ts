import type { Paygate, PaygateEvent } from '../../paygate/types.js'

/** The paygate events of a context, applied to the stores and told to the observers. */
export interface PaymentEventsHelper {
  /**
   * Apply one event a paygate's webhook produced. A throw escapes so the paygate delivers again:
   *
   * - `customer` — the customer row upserted (`country`, `currency`) or marked deleted;
   * - `checkout` `completed` — a paid one-time checkout fulfilled (purchase, lock, confirmation mail,
   *   fulfillment, `onTopUp`), a subscription checkout completed; `failed` — `onPaymentFailed`;
   *   `expired` — the unfulfilled row purged; the checkout plugins hear `settled`;
   * - `subscription` — applied to its row (`onSubscription`), a deleted one as canceled;
   * - `invoice` — a renewal re-reads and applies its subscription, a failed payment tells
   *   `onPaymentFailed`, others keep the row's latest invoice;
   * - `refund` (succeeded) and `dispute` — resolved to their fulfillment or subscription, recorded,
   *   told to `onRefund` / `onDispute`.
   */
  apply: (paygate: Paygate, event: PaygateEvent) => Promise<void>
}
