import type { SlotCommandType } from '../consts.js'
import type { SlotCommandScale } from '../types.js'

/** The time bounds of one slot command: the caller's timeout and the executor's deadline. */
export interface SlotCommandHelper {
  /**
   * Resolve the caller-side bound for one command.
   *
   * One function rather than three lookups at each call site: an asker that forgets the per-command
   * table inherits twenty minutes for a fifteen-second command, which is the failure this table was
   * added to stop.
   */
  commandTimeout: (type: SlotCommandType, command: string, override?: number, scale?: SlotCommandScale) => number
  /**
   * Resolve the executor-side deadline for one command.
   *
   * Per-command first, per-type second. It was per-type only, which is how a clone inherited the
   * bound of a `git status` — the same shape as the shell table above, and added for the same
   * reason.
   *
   * `scale.apps` (how many apps the target has, main included) adds `APP_BUILD_DEADLINE_STEP` per
   * app beyond main to a `Build` — on the caller's timeout too, so it still outlasts the executor.
   * Absent, every answer is what it always was.
   */
  commandDeadline: (type: SlotCommandType, command: string, scale?: SlotCommandScale) => number
}
