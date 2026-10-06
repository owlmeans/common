import type {
  AnyTypeSchema, SpecificationSlot, TransitionExecution, Workcard, WorkcardChanges,
} from '../../types.js'
import type { FlowLookup } from '../types.local.js'

export interface ChangeSet {
  changes: WorkcardChanges
  unset: string[]
  /** Transit only: the flow that moved, and the move. */
  flow?: string
  from?: string
  to?: string
}

/** What a transition records — computed from an execution, and the guards it must pass first. */
export interface ChangesHelper {
  /** Structural equality over JSON values. */
  sameValue: (left: unknown, right: unknown) => boolean
  /** A shallow merge that drops keys patched to `null`. */
  mergeFields: (base?: Record<string, unknown> | null, patch?: Record<string, unknown> | null) => Record<string, unknown>
  /** A copy of the record with the paths (`key`, `fields.key`, `flows.id`) removed. */
  applyUnset: <T extends object>(record: T, unset?: string[]) => T
  /**
   * Refuse an execution that writes what only the transition, the flow or the executor may write.
   *
   * `status`/`intrinsic`/`flows`/`closedAt` move only through `transit` (a create's draft may name
   * the initial status); `code` is fixed once minted unless the type's policy says `mutable`;
   * `category` is fixed; `revision`/`bodyChars` are computed; `createdBy` is the create DRAFT's
   * alone — named in `changes` or `unset` it is refused on every action, so an owner check
   * (`card.createdBy === profileId`) can trust it.
   *
   * @throws {PlanningError} `planning:immutable:<field>`
   */
  assertMutable: (exec: TransitionExecution, type: AnyTypeSchema) => void
  /**
   * The `changes`/`unset` a transition records (plan step 9).
   *
   * - `create`: the whole initial record from the draft (overlaid by `exec.changes`) — `parents`
   *   normalized, every flow at its initial status (the draft's `status` for the primary one),
   *   `status`/`intrinsic` mirrored, `closedAt` when it starts closed; a specification gets its
   *   format, `bodyChars` and revision 1 when the slot is revisioned.
   * - `update`: only what differs; `null` or `exec.unset` clears a field that has a value; a moved
   *   `parent` replaces the old one in `parents`; a revisioned document whose content changed gets
   *   `revision + 1`. An update that changes nothing is empty ({@link ChangesHelper.isEmptyChange}).
   * - `transit`: `flows[flow] = rule.to`, `status` when the flow is primary, `intrinsic` when it
   *   moves, `closedAt` set on entering closed and cleared on leaving it — plus the caller's own
   *   changes, diffed as in an update.
   * - `link`, `unlink`, `delete`: nothing.
   *
   * `createdBy` comes from a create's draft only: `changes` and `unset` never carry it, on any action
   * ({@link ChangesHelper.assertMutable} refuses an execution that tries).
   *
   * @throws {IllegalTransition} a transit the flow does not offer from the current status
   * @throws {PlanningError} `malformed:*` for an execution missing what its action needs
   */
  computeChanges: (
    card: Workcard | null | undefined,
    exec: TransitionExecution,
    type: AnyTypeSchema,
    registry: FlowLookup,
    at: string,
    opts?: { slot?: SpecificationSlot | null }
  ) => ChangeSet
  /** Nothing to write: no changed value and nothing to clear. */
  isEmptyChange: (set: Pick<ChangeSet, 'changes' | 'unset'>) => boolean
}
