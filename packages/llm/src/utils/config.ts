import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { DEFAULT_MAX_OUTPUT_CAP, MODEL_STREAM_TIMEOUT_MS } from '../consts.js'
import type { ModelConfig } from '../types.js'

/**
 * Read the original `ModelConfig` back off a model instance. Every plugin's `build`
 * passes `metadata: { config }` on the client constructor, so the config is reachable
 * for any provider. Returns an empty object when unavailable — notably for a REFINED
 * instance, which is rebuilt from `lc_kwargs` and does not reliably carry metadata.
 * That is why callers read the config from the ORIGINAL model.
 */
export const readConfig = (model: BaseChatModel): Partial<ModelConfig> => {
  const meta = (model as unknown as { metadata?: { config?: Partial<ModelConfig> } }).metadata
  return meta?.config ?? {}
}

/** Per-model idle stream timeout (ms), falling back to the package default. */
export const idleTimeout = (config: Partial<ModelConfig>): number =>
  config.streamTimeout ?? MODEL_STREAM_TIMEOUT_MS

/**
 * The output ceiling the retry escalator may climb to.
 *
 * Two different things claim to bound the output, and only one of them is a fact:
 * `maxTokensCap` is what this deployment budgeted, `maxOutput` is what the provider will
 * accept. Taking the declared cap alone let a preset out-declare its model and turned
 * every escalation into a 400; taking the capability alone would ignore a deliberately
 * frugal budget. So the declared value chooses the ceiling and the capability trims it,
 * and only when neither is stated does {@link DEFAULT_MAX_OUTPUT_CAP} apply.
 */
export const resolveOutputCap = (config: Partial<ModelConfig>): number => {
  const declared = typeof config.maxTokensCap === 'number' && config.maxTokensCap > 0
    ? config.maxTokensCap
    : undefined
  const capability = typeof config.maxOutput === 'number' && config.maxOutput > 0
    ? config.maxOutput
    : undefined
  const cap = declared ?? capability ?? DEFAULT_MAX_OUTPUT_CAP

  return capability != null ? Math.min(cap, capability) : cap
}
