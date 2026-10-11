import type { ModelEffort } from '@owlmeans/llm-common'
import type { EffortSupport } from '../../plugins/types.js'

/** Reading and climbing the effort ladder a model accepts. */
export interface EffortUtils {
  /** The position of a level in `MODEL_EFFORT_ORDER`. */
  effortRank: (effort: ModelEffort) => number
  /** `from` (the model's default when unset) raised `steps` accepted levels, stopping at the top. */
  raiseEffort: (support: EffortSupport, from: ModelEffort | undefined, steps: number) => ModelEffort
  /**
   * The effort one attempt puts on the wire. Nothing declared and nothing climbed is
   * `undefined`: omitting the field is how the provider's own default is asked for, and sending
   * that default explicitly would be a different request to any cache keyed on the body.
   */
  effortFor: (support: EffortSupport | undefined, declared: ModelEffort | undefined, steps: number) => ModelEffort | undefined
  effortAtLeast: (effort: ModelEffort | undefined, floor: ModelEffort) => boolean
  /**
   * How many effort levels a requested temperature is worth. The models that take effort have
   * mostly taken sampling away, so a caller escaping a repeated failure with "hotter" gets
   * "harder" instead — one level per {@link TEMPERATURE_PER_EFFORT_STEP}, at least one.
   */
  temperatureSteps: (temperature: number | undefined) => number
}
