import { describe, expect, test } from 'bun:test'
import { MODEL_TIER_ROLES, ModelTier } from '../src/connect/consts.js'
import { modelTierHelper } from '../src/connect/model-tier.js'
import { ModelRole } from '../src/execution/consts.js'

describe('model tiers', () => {
  test('every role the platform names has a power class of its own', () => {
    // A role absent from the table silently asks a parent for its standard model.
    for (const role of Object.values(ModelRole)) {
      expect(MODEL_TIER_ROLES[role], role).toBeDefined()
    }
  })

  test('the content gate judges on a strong model and screens on a standard one', () => {
    expect(modelTierHelper.tierOfRole(ModelRole.SecurityExpert)).toBe(ModelTier.Strong)
    expect(modelTierHelper.tierOfRole(ModelRole.JuniorSecurityExpert)).toBe(ModelTier.Standard)
  })
})
