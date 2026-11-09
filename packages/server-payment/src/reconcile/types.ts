import type { EntitlementView } from '@owlmeans/payment'
import type { ReconcileAllOptions, ReconcileAllResult, ReconcileEntityOptions } from '../types.js'

/** The entitlement repair of a context: subscriptions, the free plan and the limit counters. */
export interface ReconcileHelper {
  /**
   * Repair one entity: optionally re-read its paygate subscriptions, grant the free plan when it holds
   * nothing entitling, recompute its limit counters and its units grants' `used` from the ledger, and
   * return its view.
   */
  reconcileEntity: (entityId: string, opts?: ReconcileEntityOptions) => Promise<EntitlementView>
  /**
   * Repair every entity the payment store knows (its subscriptions, usage events and entitlement
   * grants), plus `entities`: counters — and each units grant's `used` — from the ledger in one
   * pass, then per entity the optional resync and the free-plan backfill. A failing entity is counted
   * and logged, never fatal.
   */
  reconcileAll: (opts?: ReconcileAllOptions) => Promise<ReconcileAllResult>
}
