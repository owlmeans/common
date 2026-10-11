import { ModerationCategory } from './consts.js'
import type { ModerationAction, ModerationPolicy, ModerationVerdict } from './types.js'
import type { ModerationVerdictHelper } from './verdict/types.js'

export const createModerationVerdictHelper = (): ModerationVerdictHelper => {
  const normalizeCategory = (category?: string): ModerationCategory | undefined => {
    const values = Object.values(ModerationCategory) as string[]

    return category != null && values.includes(category)
      ? category as ModerationCategory
      : undefined
  }

  const decideModeration = (
    verdict: ModerationVerdict, policy: ModerationPolicy & { entityId?: string } = {}
  ): ModerationAction => {
    if (verdict.allowed) return 'allow'
    if (policy.entityId != null && policy.bypassEntities?.includes(policy.entityId) === true) return 'allow'

    // Defaults to ON: a gate that has to be switched on is a gate that is off in every
    // environment nobody remembered to configure.
    return policy.enforce !== false ? 'refuse' : 'shadow'
  }

  return { normalizeCategory, decideModeration }
}

export const moderationVerdictHelper = createModerationVerdictHelper()
