import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { MODEL_STREAM_TIMEOUT_MS } from '../consts.js'
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
