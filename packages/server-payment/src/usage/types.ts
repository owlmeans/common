import type { LimitView } from '@owlmeans/payment'
import type {
  ConsumeRequest, CounterReconciliation, LimitOutcome, OccupancyOutcome, PaymentUsageRecord, ReleaseRequest,
} from '../types.js'

/** One usage counter: an entity's limit in one window. */
export interface CounterKey { entityId: string; limitKey: string; window: string }

export interface LedgerSum { entityId: string; limitKey: string; window: string; used: number }

/**
 * The usage ledger of a context and its counters. `payment-usage` events are the source of truth;
 * `payment-usage-counter` is a projection kept for synchronous admission — the counter may
 * over-count, never over-admit.
 */
export interface UsageHelper {
  /** @throws LimitExhausted | LimitUnknown */
  consumeLimit: (req: ConsumeRequest) => Promise<LimitOutcome>
  /** Idempotent: the release event is appended first, the counter decremented only by that append. */
  releaseLimit: (req: ReleaseRequest) => Promise<LimitOutcome>
  /** The active consume event of a key, or `null` (never consumed, or released). */
  consumptionOf: (entityId: string, limitKey: string, eventKey: string) => Promise<PaymentUsageRecord | null>
  /**
   * The newest active consume event (not released) that pays for `ref`, or `null`. For a unit held
   * per record under a fresh event key each time — an occupancy acquired again after a release —
   * this answers "does the record hold a unit, and under which key".
   */
  consumptionByRefOf: (entityId: string, limitKey: string, ref: string) => Promise<PaymentUsageRecord | null>
  /** One limit of the effective plan, read against its current window. @throws LimitUnknown */
  limitStateOf: (entityId: string, limitKey: string) => Promise<LimitView>
  /** Sum of every event's `delta`, per (entity, limit, window). */
  ledgerSums: (match: Partial<CounterKey>) => Promise<LedgerSum[]>
  /**
   * Bring an occupancy limit's ledger and counter to the live count. Appends at most one adjusting
   * event per limit per UTC day (`reconcile:<key>:<YYYY-MM-DD>`), adjusted in place by a later run of
   * the same day, so the ledger sum always equals what was last observed. Flags `overSince` while the
   * count exceeds the limit. Never stops anything.
   *
   * @throws LimitUnknown | LimitMisdeclared
   */
  reconcileOccupancyOf: (entityId: string, limitKey: string, actual: number) => Promise<OccupancyOutcome>
  /**
   * Recompute counters from the ledger — one entity, or every entity the ledger knows.
   *
   * Every (entity, limit, window) with events gets `used = max(0, sum)` and the limit of the
   * entity's current plan; a counter of a past day/month with no events is deleted (lifetime and
   * occupancy counters never are); a counter with no events otherwise reads `0`; and the current
   * window counter of every declared window limit exists.
   */
  reconcileLedgerCounters: (entityId?: string) => Promise<CounterReconciliation>
}
