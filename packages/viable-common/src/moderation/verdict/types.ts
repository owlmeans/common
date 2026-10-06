import type { ModerationCategory } from '../consts.js'
import type { ModerationAction, ModerationPolicy, ModerationVerdict } from '../types.js'

/** Reading a moderation verdict: its category, and what to do about it. */
export interface ModerationVerdictHelper {
  /**
   * Narrow whatever the model put in `category` to a real one, or to nothing.
   *
   * The wire field is a free string on purpose — see {@link ModerationVerdictSchema}. A model
   * that is allowing has nothing to categorise and still fills the field, so anything
   * unrecognized is treated as absent rather than as a failure.
   */
  normalizeCategory: (category?: string) => ModerationCategory | undefined
  /**
   * What to do about a verdict.
   *
   * Pure, because this is the part with the operational levers on it and the part most likely
   * to be wrong in a hurry: `enforce` turns the whole gate into an observer without a deploy,
   * and `bypassEntities` releases one entity when a real customer is wrongly refused.
   */
  decideModeration: (verdict: ModerationVerdict, policy?: ModerationPolicy & { entityId?: string }) => ModerationAction
}
