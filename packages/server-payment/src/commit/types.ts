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
   * (`force`). One row per grant (`free:<entityId>` / `internal:<planSku>:<entityId>`), upserted.
   *
   * Observers hear `created` when the row first entitles, and again (`previous: null`, the key
   * suffixed with the row's new `restartedAt`) when a re-grant re-activates a row that had stopped
   * entitling — revoked, or past its period end. A re-grant of an entitling row only moves its
   * period end and tells nobody. `createdAt` is always the FIRST grant's: subscription-week windows,
   * credit frames and grandfathered promos keep their anchor, so a revoke and a re-grant inside one
   * window never open a second allowance in it.
   */
  grantInternalPlan: (entityId: string, planSku: string, opts?: GrantInternalPlanOptions) => Promise<PaymentSubscriptionRecord>
  /**
   * End an internal grant now: `status: canceled`, `periodEnd` / `endedAt` = now (a grant already
   * past its period end keeps that instant), `canceledAt` = now. Observers hear `canceled` — the
   * event a paygate cancellation delivers. Idempotent: no row, or a row ended already, changes
   * nothing and tells nobody.
   *
   * @returns whether anything changed
   */
  revokeInternalPlan: (entityId: string, planSku: string) => Promise<boolean>
}
