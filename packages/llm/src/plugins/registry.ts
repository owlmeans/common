import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { LlmPluginError } from '../errors.js'
import type { ModelConfig } from '../types.js'
import type { EffortSupport, LlmPlugin } from './types.js'
import type { LlmPluginRegistry } from './registry/types.js'
import { anthropicPlugin } from './anthropic.js'
import { compatiblePlugin } from './compatible.js'
import { openAiPlugin } from './openai.js'

/**
 * Process-wide, seeded with the built-in plugins in their registration order. Module-level on
 * purpose: a plugin registered through any instance must govern every call of the process.
 */
const plugins: Record<string, LlmPlugin> = {
  [anthropicPlugin.type]: anthropicPlugin,
  [compatiblePlugin.type]: compatiblePlugin,
  [openAiPlugin.type]: openAiPlugin,
}

/**
 * Lookup order for INSTANCE-based resolution (a model whose config metadata is not
 * reachable). The first plugin whose `owns` matches wins, so the conservative member of
 * a client family must come first: `compatible` precedes `openai` because both build a
 * `ChatOpenAI`, and assuming the tool-calling hack for an unlabelled model is safe
 * everywhere, while assuming native JSON-schema support is not.
 */
const order: string[] = [anthropicPlugin.type, compatiblePlugin.type, openAiPlugin.type]

export const createLlmPluginRegistry = (): LlmPluginRegistry => {
  const register = (plugin: LlmPlugin): void => {
    if (plugins[plugin.type] == null) {
      order.push(plugin.type)
    }
    plugins[plugin.type] = plugin
  }

  const pluginOf = (provider: string | undefined): LlmPlugin | undefined =>
    provider != null ? plugins[provider] : undefined

  const effortSupportOf = (
    config: Pick<ModelConfig, 'provider' | 'model' | 'disableThinking'>,
  ): EffortSupport | undefined => pluginOf(config.provider)?.effort?.(config)

  const pluginFor = (model: BaseChatModel): LlmPlugin | undefined =>
    order.map(type => plugins[type]).find(plugin => plugin?.owns(model) === true)

  const resolvePlugin = (
    config: { provider?: string } | undefined,
    model?: BaseChatModel,
  ): LlmPlugin => {
    const byType = pluginOf(config?.provider)
    if (byType != null) return byType
    const byModel = model != null ? pluginFor(model) : undefined
    if (byModel != null) return byModel
    throw new LlmPluginError(`${LlmPluginError.NO_PLUGIN}:${config?.provider ?? 'unknown'}`)
  }

  return { plugins, register, pluginOf, effortSupportOf, pluginFor, resolvePlugin }
}

export const llmPluginRegistry = createLlmPluginRegistry()
