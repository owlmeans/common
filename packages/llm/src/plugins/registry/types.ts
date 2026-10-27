import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { ModelConfig } from '../../types.js'
import type { EffortSupport, LlmPlugin } from '../types.js'

/** The process-wide table of provider plugins, and how a call finds the one governing it. */
export interface LlmPluginRegistry {
  /** Every registered plugin by its `type` — the live table, shared by the whole process. */
  readonly plugins: Record<string, LlmPlugin>
  /** Register (or replace) a provider plugin. Later registrations go last in the lookup order. */
  register: (plugin: LlmPlugin) => void
  /** The plugin registered for `provider`, or `undefined`. */
  pluginOf: (provider: string | undefined) => LlmPlugin | undefined
  /** The `ModelConfig.effort` levels this config's model accepts, or `undefined` for none. */
  effortSupportOf: (config: Pick<ModelConfig, 'provider' | 'model' | 'disableThinking'>) => EffortSupport | undefined
  /**
   * The first registered plugin that recognises this model instance, or `undefined`. By instance
   * alone every `ChatOpenAI` is `compatible`'s — use {@link resolveFor} for a model the service built.
   */
  pluginFor: (model: BaseChatModel) => LlmPlugin | undefined
  /**
   * The plugin governing a model: the one of the provider its config names (what the service built
   * it with), else {@link pluginFor}. Call it on the UNBOUND model — a `bindTools` binding carries
   * no config and no plugin claims it.
   */
  resolveFor: (model: BaseChatModel) => LlmPlugin | undefined
  /**
   * Resolve the plugin governing a call. The config's `provider` is authoritative; when it
   * is unavailable (a refined instance whose metadata did not survive) the model instance
   * is matched against the registration order.
   */
  resolvePlugin: (config: { provider?: string } | undefined, model?: BaseChatModel) => LlmPlugin
}
