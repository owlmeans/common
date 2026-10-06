import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { FALLBACK_AFTER_ATTEMPTS } from '../consts.js'
import { llmPluginRegistry } from '../plugins/registry.js'
import { configUtils } from './config.js'
import type { Rung, RungPosition, RungUtils } from './rungs/types.js'

export const createRungUtils = (): RungUtils => {
  const rungsOf = (model: BaseChatModel): Rung[] => {
    const rungs: Rung[] = []
    for (
      let current: BaseChatModel | undefined = model;
      current != null;
      current = (current as unknown as { __fallbackModel?: BaseChatModel }).__fallbackModel
    ) {
      const config = configUtils.readConfig(current)
      rungs.push({
        index: rungs.length, model: current, config,
        plugin: llmPluginRegistry.pluginOf(config.provider) ?? llmPluginRegistry.pluginFor(current),
      })
    }

    return rungs
  }

  const rungAt = (rungs: Rung[], attempt: number): RungPosition => {
    const index = Math.min(Math.floor(attempt / FALLBACK_AFTER_ATTEMPTS), rungs.length - 1)
    return { rung: rungs[index]!, rungAttempt: attempt - index * FALLBACK_AFTER_ATTEMPTS }
  }

  return { rungsOf, rungAt }
}

export const rungUtils = createRungUtils()
