import { MODEL_EFFORT_ORDER } from '@owlmeans/llm-common'
import type { ModelEffort } from '@owlmeans/llm-common'
import { TEMPERATURE_PER_EFFORT_STEP } from '../consts.js'
import type { EffortSupport } from '../plugins/types.js'
import type { EffortUtils } from './effort/types.js'

export const createEffortUtils = (): EffortUtils => {
  const effortRank = (effort: ModelEffort): number => MODEL_EFFORT_ORDER.indexOf(effort)

  /**
   * The accepted level nearest to `wanted` from below: a model that tops out at `high` runs a
   * requested `xhigh` at `high` instead of answering 400. Below every accepted level, the lowest.
   */
  const clampEffort = (support: EffortSupport, wanted: ModelEffort): ModelEffort =>
    [...support.levels].reverse().find(level => effortRank(level) <= effortRank(wanted))
      ?? support.levels[0]!

  const raiseEffort = (
    support: EffortSupport, from: ModelEffort | undefined, steps: number,
  ): ModelEffort => {
    const start = support.levels.indexOf(clampEffort(support, from ?? support.default))
    return support.levels[Math.min(start + Math.max(0, steps), support.levels.length - 1)]!
  }

  const effortFor = (
    support: EffortSupport | undefined, declared: ModelEffort | undefined, steps: number,
  ): ModelEffort | undefined =>
    support == null || (declared == null && steps <= 0) ? undefined : raiseEffort(support, declared, steps)

  const effortAtLeast = (effort: ModelEffort | undefined, floor: ModelEffort): boolean =>
    effort != null && effortRank(effort) >= effortRank(floor)

  const temperatureSteps = (temperature: number | undefined): number =>
    temperature != null && temperature > 0
      ? Math.max(1, Math.round(temperature / TEMPERATURE_PER_EFFORT_STEP))
      : 0

  return { effortRank, raiseEffort, effortFor, effortAtLeast, temperatureSteps }
}

export const effortUtils = createEffortUtils()
