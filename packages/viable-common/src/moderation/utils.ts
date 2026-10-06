import type { ModerationCategory } from './consts.js'
import type { ModerationAction, ModerationPolicy, ModerationVerdict } from './types.js'
import { moderationVerdictHelper } from './verdict.js'

/** @deprecated compat:factory-refactor — use `moderationVerdictHelper.normalizeCategory(…)` */
export const normalizeCategory = (category?: string): ModerationCategory | undefined =>
  moderationVerdictHelper.normalizeCategory(category)

/** @deprecated compat:factory-refactor — use `moderationVerdictHelper.decideModeration(…)` */
export const decideModeration = (
  verdict: ModerationVerdict, policy: ModerationPolicy & { entityId?: string } = {}
): ModerationAction => moderationVerdictHelper.decideModeration(verdict, policy)
