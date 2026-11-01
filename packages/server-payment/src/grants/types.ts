import type {
  EntitlementGrantListOptions, EntitlementGrantRevocation, EntitlementGrantRevokeOptions, EntitlementGrantSpec,
  PaymentGrantRecord,
} from '../types.js'

/**
 * A context's entitlement grants (`payment-grant`): extra units of a limit or a capability, given to
 * one organization beside its plan — Mongo only, so it works in an unmanaged process too.
 *
 * - `units` are consumed only after the plan's own allowance is exhausted (`consume`), returned by a
 *   release, folded into the limit's `limit` / `used` / `remaining` everywhere a limit is read, and
 *   rebuilt from their usage events by `reconcileCounters`.
 * - `capability` grants — and the capability a `units` grant may carry — are merged into the
 *   effective plan's capabilities while in force.
 * - A grant is in force while `active`, from `startsAt` until `endsAt`; a revoked or ended grant is
 *   ignored at read time — its used units stay consumed, its unused ones are gone.
 */
export interface EntitlementGrantHelper {
  /**
   * Give an organization a grant, then tell `onEntitlementGrant` (`granted`). A `units` grant starts
   * with nothing used.
   *
   * @throws UnsupportedArgumentError — `entityId`, `kind`, `limitKey`, `amount`, `capability`, `startsAt`, `endsAt`
   * @throws LimitUnknown when no declared plan has the limit key
   */
  grant: (entityId: string, spec: EntitlementGrantSpec) => Promise<PaymentGrantRecord>
  /**
   * Revoke a grant now (`status: revoked`, `revokedAt`), then tell `onEntitlementGrant` (`revoked`).
   * Idempotent: a revoked grant answers `changed: false` and nobody is told again. Used units stay
   * consumed (their events keep their records' units); the unused ones are gone with the grant.
   */
  revoke: (grantId: string, opts?: EntitlementGrantRevokeOptions) => Promise<EntitlementGrantRevocation>
  /** One grant by id, or `null`. */
  get: (grantId: string) => Promise<PaymentGrantRecord | null>
  /** An organization's grants, the newest first; `active` narrows to those (not) in force at `at`. */
  list: (entityId: string, opts?: EntitlementGrantListOptions) => Promise<PaymentGrantRecord[]>
  /**
   * The grants in force at `at` (default now) — what plan resolution, the limit numbers and the
   * entitlement view fold in. Empty in a context without the `payment-grant` resource.
   */
  inForce: (entityId: string, at?: Date) => Promise<PaymentGrantRecord[]>
}
