import type { ConsumerReconcileOptions, ConsumerReconcileResult } from '../../types.js'

/** The consumer-rights repair of one service in a context. */
export interface ConsumerReconcileHelper {
  /**
   * The consumer-rights repair an application runs nightly: retry the paygate steps of withdrawals
   * (refunds, credit notes, subscription cancels) and scheduled cancellations, failed mails and
   * failed observers; backfill purchases of completed checkouts of the last 16 days that have no
   * row; lock organizations that paid before countries were locked. The paygate steps, the
   * backfill and the legacy locks need a managed service. Each step handles at most `limit` items.
   */
  reconcile: (opts?: ConsumerReconcileOptions) => Promise<ConsumerReconcileResult>
}
