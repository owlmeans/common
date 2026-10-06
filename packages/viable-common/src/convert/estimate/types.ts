import type { ModelRole } from '../../execution/consts.js'
import type { ConversionStage, EstimateSlice } from '../consts.js'

/**
 * One row of a stage's role plan — what the estimator believes a step will spend.
 *
 * Data rather than a measurement: the plan says which slices of the origin a step reads, how many
 * calls it makes and what it writes back, and the estimator projects tokens from the census. A
 * step that is per-story is multiplied by the story count instead of run once.
 */
export interface RolePlanEntry {
  step: string
  role: ModelRole
  slices: EstimateSlice[]
  /** What share of the named slices this step actually reads. */
  factor: number
  calls: number
  /** Fixed input tokens per call — the persona, the framing, the schema. */
  overhead: number
  /** Expected output tokens per call. */
  output: number
  perStory?: boolean
}

export interface RoleEstimate {
  role: ModelRole
  calls: number
  inputTokens: number
  outputTokens: number
  steps: string[]
}

/**
 * What one stage is expected to cost, as the platform stores it on the conversion record.
 *
 * Priced on the agent, where the model presets and the run mode are: a DELEGATED conversion runs
 * its model calls on the parent agent and costs the platform nothing, so `usd` is zero and
 * `delegated` says why. `basis` is kept so a user can see what the number was projected from
 * rather than being handed a figure with no provenance.
 */
export interface ConversionEstimate {
  stage: ConversionStage
  version: number
  roles: RoleEstimate[]
  inputTokens: number
  outputTokens: number
  usd: number
  /** @deprecated Credits are USD at the reference rate now — read `usd`. Kept for records stored before the change. */
  credits?: number
  delegated: boolean
  basis: {
    files: number
    bytes: number
    storyCount?: number
    sampleRatio: number
    retryFactor: number
  }
  computedAt: string
}

/**
 * The per-story band shown before the implementation stage.
 *
 * A range, because a story's cost is set by how much code it turns out to need — which is exactly
 * what nothing knows before it is written. Shown with the disclaimer that says so.
 */
export interface StoryEstimateBand {
  minUsd: number
  maxUsd: number
  /** @deprecated Credits are USD at the reference rate now — read `minUsd`. Kept for records stored before the change. */
  minCredits?: number
  /** @deprecated Credits are USD at the reference rate now — read `maxUsd`. Kept for records stored before the change. */
  maxCredits?: number
  perStory: { code: string, complexity: number, minUsd: number, maxUsd: number }[]
}
