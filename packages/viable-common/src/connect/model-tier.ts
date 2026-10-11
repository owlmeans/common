import { MODEL_TIER_ROLES, ModelTier } from './consts.js'
import type { ModelTierHelper } from './model-tier/types.js'

export const createModelTierHelper = (): ModelTierHelper => {
  const tierOfRole = (role: string): ModelTier =>
    MODEL_TIER_ROLES[role] ?? ModelTier.Standard

  const clampTier = (wanted: ModelTier, offered: ModelTier[]): ModelTier => {
    if (offered.length < 1 || offered.includes(wanted)) return wanted
    const ladder = [ModelTier.Strong, ModelTier.Standard, ModelTier.Cheap]
    const from = ladder.indexOf(wanted)
    // Prefer a stronger model over a weaker one: the task was sized for `wanted`.
    for (let i = from; i >= 0; --i) if (offered.includes(ladder[i])) return ladder[i]
    for (let i = from + 1; i < ladder.length; ++i) if (offered.includes(ladder[i])) return ladder[i]

    return wanted
  }

  return { tierOfRole, clampTier }
}

export const modelTierHelper = createModelTierHelper()
