import type { StoryProof } from './analysis/types.js'

/**
 * How much work re-implementing a story is, as a multiplier on the per-story price band.
 *
 * Derived from what the extraction found, never asked of a model: a story backed by a handful of
 * proofs and no algorithm is ordinary CRUD, one that carries described algorithms is business
 * logic somebody has to reproduce. Two runs over the same extraction therefore price identically,
 * which is the point — a band that moved between two viewings of the same screen would be noise.
 */
export const storyComplexity = (proof: Pick<StoryProof, 'proofs' | 'algorithms'>): number => {
  const proofs = proof.proofs?.length ?? 0
  const algorithms = proof.algorithms?.length ?? 0

  if (algorithms > 1 || proofs > 8) return 2
  if (algorithms > 0 || proofs > 3) return 1.5

  return 1
}
