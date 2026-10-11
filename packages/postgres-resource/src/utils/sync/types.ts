import type { DdlPlan, TableSpec } from '../../types.js'

/** The reconciliation steps run over one checked out connection. */
export interface PgSyncHelper {
  /**
   * Serialize initialization across replicas. A session level lock, not `xact`, because
   * migrations run in their own transactions inside the critical section.
   */
  acquireLock: (qualified: string) => Promise<void>
  /** Release the {@link PgSyncHelper.acquireLock} lock; never masks the failure that preceded it. */
  releaseLock: (qualified: string) => Promise<void>
  /** `CREATE SCHEMA IF NOT EXISTS`. */
  ensureSchema: (schema: string) => Promise<void>
  /**
   * Apply a reconciliation plan in a single transaction.
   *
   * Postgres DDL is transactional, so a plan that fails partway leaves the table exactly as
   * it was. That property is what makes converging without confirmation prompts tolerable —
   * the table is either fully converged or untouched, never half migrated.
   *
   * @throws {PostgresCastRequired} Postgres refused an automatic cast.
   * @throws {PostgresSyncError} any other statement failed — the message names the statement.
   */
  applyPlan: (spec: TableSpec, plan: DdlPlan) => Promise<DdlPlan>
}
