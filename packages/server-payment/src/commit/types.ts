import type {
  CommitOptions, CommitResult, GrantInternalPlanOptions, PaymentSubscriptionRecord, PropagatedState,
  SubscriptionSnapshot,
} from '../types.js'

/** A context's subscription rows: what observers see of them, how a new state is committed, internal grants. */
export interface SubscriptionCommitHelper {
  /** A subscription as observers see it; `state` overlays what was last propagated. */
  snapshotOf: (record: PaymentSubscriptionRecord, state?: PropagatedState) => Promise<SubscriptionSnapshot>
  /**
   * Store a subscription's new state, tell observers what changed, then record what was told.
   *
   * The state is written BEFORE observers run, so an observer reading entitlements sees the new plan.
   * What classification compares against is the state last PROPAGATED (`propagated`), stamped only
   * after every observer succeeded — so an observer that throws leaves the change to be classified
   * again, identically, when the paygate retries. `lastEventId` is stamped with it.
   */
  commitSubscription: (
    previous: PaymentSubscriptionRecord | null, next: PaymentSubscriptionRecord, opts?: CommitOptions,
  ) => Promise<CommitResult>
  /**
   * Grant a plan without a paygate — the free plan every entity holds, or a complimentary one
   * (`force`). One row per grant (`free:<entityId>` / `internal:<planSku>:<entityId>`), upserted: its
   * `createdAt` survives a re-grant, and observers hear `created` once.
   */
  grantInternalPlan: (entityId: string, planSku: string, opts?: GrantInternalPlanOptions) => Promise<PaymentSubscriptionRecord>
}
