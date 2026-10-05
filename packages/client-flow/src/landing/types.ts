import type { FlowModel } from '@owlmeans/flow'
import type { SuspendedLanding } from '../types.js'

/** A flow suspended across the platform's sign-in, and the landing it is resumed at. */
export interface FlowLandingHelper {
  /**
   * Suspend a flow that is about to leave for the platform's own sign-in dispatcher, so whichever
   * sign-in method completes can send the person back to where they started instead of `HOME`.
   *
   * Driven by the flow model rather than a raw URL: `model.next()` is the flow's own answer to
   * "where does this step lead", so a caller never re-derives a destination the flow already knows,
   * and a flow whose current step offers no way forward (`next()` throws) suspends nothing rather
   * than persisting a landing that can never be reached. The persisted record is deliberately NOT a
   * serialized flow token — the destination step is always one this application can enter fresh (an
   * `initial`-marked screen reading its own `ref`/`kind` from the query), so nothing needs to
   * reconstruct the exact `FlowModel` instance on the other side of a sign-in redirect, and this
   * helper stays usable by any flow, not only one particular package's.
   *
   * Returns `false` when there is nowhere to persist this (no `FLOW_STATE` resource registered) or
   * nothing to suspend to (the current step has no forward transition, or its destination has no
   * `module`) — the caller falls back to its own default landing (ordinarily `HOME`).
   */
  suspendFlow: (model: FlowModel, opts: { expiresAt: number }) => Promise<boolean>
  /**
   * Read back a suspended landing, once. Delete-on-read: the record answers exactly one sign-in,
   * because a landing a stale browser tab left behind must never resurrect on somebody else's
   * sign-in later in the same session.
   *
   * `null` covers every reason there is nothing to resume: no resource, no record, or a record
   * whose window has closed — the caller's own default landing is exactly as safe an answer.
   */
  resumeSuspendedFlow: () => Promise<SuspendedLanding | null>
}
