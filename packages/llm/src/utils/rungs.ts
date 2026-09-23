import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { FALLBACK_AFTER_ATTEMPTS } from '../consts.js'
import { pluginFor, pluginOf } from '../plugins/index.js'
import type { LlmPlugin } from '../plugins/types.js'
import type { ModelConfig } from '../types.js'
import { readConfig } from './config.js'

/** One model of a role's escalation chain, with the config and plugin it is called through. */
export interface Rung {
  index: number
  model: BaseChatModel
  config: Partial<ModelConfig>
  plugin: LlmPlugin | undefined
}

/**
 * The primary and every fallback the service hung off it, in escalation order. Read once from
 * the ORIGINAL instances: a refined model does not keep its metadata.
 */
export const rungsOf = (model: BaseChatModel): Rung[] => {
  const rungs: Rung[] = []
  for (
    let current: BaseChatModel | undefined = model;
    current != null;
    current = (current as unknown as { __fallbackModel?: BaseChatModel }).__fallbackModel
  ) {
    const config = readConfig(current)
    rungs.push({
      index: rungs.length, model: current, config,
      plugin: pluginOf(config.provider) ?? pluginFor(current),
    })
  }

  return rungs
}

/** The rung attempt N runs on, and how far into that rung it is. The last rung never ends. */
export const rungAt = (rungs: Rung[], attempt: number): { rung: Rung, rungAttempt: number } => {
  const index = Math.min(Math.floor(attempt / FALLBACK_AFTER_ATTEMPTS), rungs.length - 1)
  return { rung: rungs[index]!, rungAttempt: attempt - index * FALLBACK_AFTER_ATTEMPTS }
}
