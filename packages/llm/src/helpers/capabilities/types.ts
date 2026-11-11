import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { MediaNeeds, ModelCapabilities } from '@owlmeans/llm-common'
import type { ModelConfig } from '../../types.js'

/**
 * What a model accepts, read from its configs (`ModelConfig.vision`, `documents`) rung by rung.
 * The ladder is the one the model escalates through, so a call carrying media goes only to the
 * rungs listed as accepting it.
 */
export interface CapabilityHelper {
  /**
   * From a model `LlmService.getModel` built (or a helper execution's `model`): the primary and
   * every fallback hung off it. A model built elsewhere carries no config and accepts nothing.
   */
  of: (model: BaseChatModel) => ModelCapabilities
  /** From resolved configs, primary first — `resolveFallbacks(config)`. No client is built. */
  fromConfigs: (configs: readonly Partial<ModelConfig>[]) => ModelCapabilities
  /** Whether some rung covers every need. */
  accepts: (capabilities: ModelCapabilities, needs: Partial<MediaNeeds>) => boolean
  /**
   * The fallback chain itself: the primary and every fallback `LlmService.getModel` hung off it,
   * in escalation order, so position `i` is the model `of(model).rungs[i]` describes. A model built
   * elsewhere is a one-rung ladder.
   */
  ladder: (model: BaseChatModel) => BaseChatModel[]
}
