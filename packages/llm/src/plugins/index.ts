import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { ModelConfig } from '../types.js'
import type { EffortSupport, LlmPlugin } from './types.js'
import { llmPluginRegistry } from './registry.js'

/** @deprecated compat:factory-refactor — use `llmPluginRegistry.plugins` */
export const plugins: Record<string, LlmPlugin> = llmPluginRegistry.plugins

/** @deprecated compat:factory-refactor — use `llmPluginRegistry.register(…)` */
export const registerLlmPlugin = (plugin: LlmPlugin): void => llmPluginRegistry.register(plugin)

/** @deprecated compat:factory-refactor — use `llmPluginRegistry.pluginOf(…)` */
export const pluginOf = (provider: string | undefined): LlmPlugin | undefined => llmPluginRegistry.pluginOf(provider)

/** @deprecated compat:factory-refactor — use `llmPluginRegistry.effortSupportOf(…)` */
export const effortSupportOf = (
  config: Pick<ModelConfig, 'provider' | 'model' | 'disableThinking'>,
): EffortSupport | undefined => llmPluginRegistry.effortSupportOf(config)

/** @deprecated compat:factory-refactor — use `llmPluginRegistry.pluginFor(…)` */
export const pluginFor = (model: BaseChatModel): LlmPlugin | undefined => llmPluginRegistry.pluginFor(model)

/** @deprecated compat:factory-refactor — use `llmPluginRegistry.resolvePlugin(…)` */
export const resolvePlugin = (config: { provider?: string } | undefined, model?: BaseChatModel): LlmPlugin =>
  llmPluginRegistry.resolvePlugin(config, model)
