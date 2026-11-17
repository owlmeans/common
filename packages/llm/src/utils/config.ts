import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { DEFAULT_MAX_OUTPUT_CAP, MODEL_PROGRESS_TIMEOUT_MS, MODEL_STREAM_TIMEOUT_MS } from '../consts.js'
import type { ModelConfig } from '../types.js'
import type { ConfigUtils } from './config/types.js'

export const createConfigUtils = (): ConfigUtils => {
  const readConfig = (model: BaseChatModel): Partial<ModelConfig> => {
    const meta = (model as unknown as { metadata?: { config?: Partial<ModelConfig> } }).metadata
    return meta?.config ?? {}
  }

  const idleTimeout = (config: Partial<ModelConfig>): number =>
    config.streamTimeout ?? MODEL_STREAM_TIMEOUT_MS

  const progressTimeout = (config: Partial<ModelConfig>): number =>
    config.progressTimeout ?? MODEL_PROGRESS_TIMEOUT_MS

  const resolveOutputCap = (config: Partial<ModelConfig>): number => {
    const declared = typeof config.maxTokensCap === 'number' && config.maxTokensCap > 0
      ? config.maxTokensCap
      : undefined
    const capability = typeof config.maxOutput === 'number' && config.maxOutput > 0
      ? config.maxOutput
      : undefined
    const cap = declared ?? capability ?? DEFAULT_MAX_OUTPUT_CAP

    return capability != null ? Math.min(cap, capability) : cap
  }

  return { readConfig, idleTimeout, progressTimeout, resolveOutputCap }
}

export const configUtils = createConfigUtils()
