import { MODEL_EFFORT_ORDER } from '@owlmeans/llm-common'
import type { ModelEffort } from '@owlmeans/llm-common'
import { TEMPERATURE_PER_EFFORT_STEP } from '../consts.js'
import type { EffortSupport } from '../plugins/types.js'

export const effortRank = (effort: ModelEffort): number => MODEL_EFFORT_ORDER.indexOf(effort)

/**
 * The accepted level nearest to `wanted` from below: a model that tops out at `high` runs a
 * requested `xhigh` at `high` instead of answering 400. Below every accepted level, the lowest.
 */
export const clampEffort = (support: EffortSupport, wanted: ModelEffort): ModelEffort =>
  [...support.levels].reverse().find(level => effortRank(level) <= effortRank(wanted))
    ?? support.levels[0]!

/** `from` (the model's default when unset) raised `steps` accepted levels, stopping at the top. */
export const raiseEffort = (
  support: EffortSupport, from: ModelEffort | undefined, steps: number,
): ModelEffort => {
  const start = support.levels.indexOf(clampEffort(support, from ?? support.default))
  return support.levels[Math.min(start + Math.max(0, steps), support.levels.length - 1)]!
}

/**
 * The effort one attempt puts on the wire. Nothing declared and nothing climbed is
 * `undefined`: omitting the field is how the provider's own default is asked for, and sending
 * that default explicitly would be a different request to any cache keyed on the body.
 */
export const effortFor = (
  support: EffortSupport | undefined, declared: ModelEffort | undefined, steps: number,
): ModelEffort | undefined =>
  support == null || (declared == null && steps <= 0) ? undefined : raiseEffort(support, declared, steps)

export const effortAtLeast = (effort: ModelEffort | undefined, floor: ModelEffort): boolean =>
  effort != null && effortRank(effort) >= effortRank(floor)

/**
 * How many effort levels a requested temperature is worth. The models that take effort have
 * mostly taken sampling away, so a caller escaping a repeated failure with "hotter" gets
 * "harder" instead — one level per {@link TEMPERATURE_PER_EFFORT_STEP}, at least one.
 */
export const temperatureSteps = (temperature: number | undefined): number =>
  temperature != null && temperature > 0
    ? Math.max(1, Math.round(temperature / TEMPERATURE_PER_EFFORT_STEP))
    : 0
