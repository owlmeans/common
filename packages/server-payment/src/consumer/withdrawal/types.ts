import type { ConsumerDeclarationRecord, PurchaseRecord, UsageMeter } from '../../types.js'
import type { WithdrawalComputation, WithdrawalExecution } from '../types.js'
import type { Paygate } from '../../paygate/types.js'

/** Withdrawals of a context: what they reimburse and their paygate steps. */
export interface WithdrawalHelper {
  /**
   * The refund of a withdrawal from one purchase, in the consumer's favour (`@owlmeans/payment`
   * calculators). The meter's deduction is `usedAfter + settled + clawed`: units used after consent
   * (before it the consumer bears no cost), units that paid an earlier overdraft, units already
   * refunded by money. A subscription's `time` components count from its start request; without
   * one nothing is deducted for time.
   */
  computeWithdrawal: (meter: UsageMeter, purchase: PurchaseRecord, at: Date) => Promise<WithdrawalComputation>
  /**
   * Execute a withdrawal at the purchase's paygate, the first attempt of every call under the
   * idempotency key `withdrawal:<id>:<step>` (a retry by `reconcile` uses `…:<attempt>` and adopts
   * what an earlier attempt made):
   *
   * 1. a subscription purchase: `subscriptions.cancelNow`, without proration or a final invoice;
   * 2. an invoice-backed purchase (a paygate with `payments.creditNotes`): a credit-note preview of
   *    the invoice line at the net refund, then OUR refund for the previewed total (metadata
   *    `withdrawalId` — the refund webhook then tells observers not to claw back), then a credit note
   *    documenting that refund — the corrective tax document; a failed credit note keeps the plain
   *    refund and is recorded;
   * 3. otherwise: a plain proportional refund on the payment.
   *
   * Steps that already succeeded (a recorded `ok` event) are skipped. Every step is an event.
   */
  executeWithdrawal: (
    paygate: Paygate, declaration: ConsumerDeclarationRecord, purchase: PurchaseRecord,
    computation: { refundMinor: number, netMinor: number }, opts?: { attempt?: number },
  ) => Promise<WithdrawalExecution>
  /** Retry a credit note that failed after its refund succeeded (`false` without `payments.creditNotes`). */
  retryCreditNote: (
    paygate: Paygate, declaration: ConsumerDeclarationRecord, purchase: PurchaseRecord,
    netMinor: number, refundId: string, attempt: number,
  ) => Promise<boolean>
}
