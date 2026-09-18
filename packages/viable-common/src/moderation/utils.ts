import { ModerationCategory } from './consts.js'
import type { ModerationAction, ModerationPolicy, ModerationVerdict } from './types.js'

/**
 * Narrow whatever the model put in `category` to a real one, or to nothing.
 *
 * The wire field is a free string on purpose — see {@link ModerationVerdictSchema}. A model
 * that is allowing has nothing to categorise and still fills the field, so anything
 * unrecognized is treated as absent rather than as a failure.
 */
export const normalizeCategory = (category?: string): ModerationCategory | undefined => {
  const values = Object.values(ModerationCategory) as string[]

  return category != null && values.includes(category)
    ? category as ModerationCategory
    : undefined
}

/**
 * What to do about a verdict.
 *
 * Pure, because this is the part with the operational levers on it and the part most likely
 * to be wrong in a hurry: `enforce` turns the whole gate into an observer without a deploy,
 * and `bypassEntities` releases one entity when a real customer is wrongly refused.
 */
export const decideModeration = (
  verdict: ModerationVerdict, policy: ModerationPolicy & { entityId?: string } = {}
): ModerationAction => {
  if (verdict.allowed) return 'allow'
  if (policy.entityId != null && policy.bypassEntities?.includes(policy.entityId) === true) return 'allow'

  // Defaults to ON: a gate that has to be switched on is a gate that is off in every
  // environment nobody remembered to configure.
  return policy.enforce !== false ? 'refuse' : 'shadow'
}
