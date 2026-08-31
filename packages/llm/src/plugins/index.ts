import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { LlmPluginError } from '../errors.js'
import type { LlmPlugin } from './types.js'
import { anthropicPlugin } from './anthropic.js'
import { compatiblePlugin } from './compatible.js'
import { openAiPlugin } from './openai.js'

export const plugins: Record<string, LlmPlugin> = {}

/**
 * Lookup order for INSTANCE-based resolution (a model whose config metadata is not
 * reachable). The first plugin whose `owns` matches wins, so the conservative member of
 * a client family must come first: `compatible` precedes `openai` because both build a
 * `ChatOpenAI`, and assuming the tool-calling hack for an unlabelled model is safe
 * everywhere, while assuming native JSON-schema support is not.
 */
const order: string[] = []

/** Register (or replace) a provider plugin. Later registrations go last in the lookup order. */
export const registerLlmPlugin = (plugin: LlmPlugin): void => {
  if (plugins[plugin.type] == null) {
    order.push(plugin.type)
  }
  plugins[plugin.type] = plugin
}

registerLlmPlugin(anthropicPlugin)
registerLlmPlugin(compatiblePlugin)
registerLlmPlugin(openAiPlugin)

/** The plugin registered for `provider`, or `undefined`. */
export const pluginOf = (provider: string | undefined): LlmPlugin | undefined =>
  provider != null ? plugins[provider] : undefined

/** The first registered plugin that recognises this model instance, or `undefined`. */
export const pluginFor = (model: BaseChatModel): LlmPlugin | undefined =>
  order.map(type => plugins[type]).find(plugin => plugin?.owns(model) === true)

/**
 * Resolve the plugin governing a call. The config's `provider` is authoritative; when it
 * is unavailable (a refined instance whose metadata did not survive) the model instance
 * is matched against the registration order.
 */
export const resolvePlugin = (
  config: { provider?: string } | undefined,
  model?: BaseChatModel,
): LlmPlugin => {
  const byType = pluginOf(config?.provider)
  if (byType != null) return byType
  const byModel = model != null ? pluginFor(model) : undefined
  if (byModel != null) return byModel
  throw new LlmPluginError(`${LlmPluginError.NO_PLUGIN}:${config?.provider ?? 'unknown'}`)
}
