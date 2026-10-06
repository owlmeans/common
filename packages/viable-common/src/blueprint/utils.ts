import { LANDING_GATE_PREFERENCES } from './consts.local.js'
import { LandingGatePreference } from './consts.js'
import type { Blueprint } from './types.js'

/**
 * The landing-gate preference of a resolved blueprint.
 *
 * Total: an absent layer, an absent key and a value this deploy does not know (a patch serialized
 * by a newer one) all answer `Allow` — the neutral prior, which leaves the decision to the
 * specification rather than tilting it either way on a value nobody set.
 */
export const landingGatePreferenceOf = (
  blueprint?: Pick<Blueprint, 'experience'> | null
): LandingGatePreference => {
  const value = blueprint?.experience?.landingGate

  return value != null && LANDING_GATE_PREFERENCES.has(value)
    ? value
    : LandingGatePreference.Allow
}
