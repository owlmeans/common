import type { ModelConfig } from '../../../types.js'
import type { ThinkingOff } from '../../consts.js'
import type { AnthropicModelSupport } from '../../types.js'

/** What an Anthropic model id accepts on the wire, read from `ANTHROPIC_MODEL_SUPPORT`. */
export interface AnthropicSupportHelper {
  /** Whether this model id rejects `temperature`/`top_p`/`top_k`. */
  rejectsSampling: (model: string | undefined) => boolean
  /** The family entry of a model id, or `undefined` for a model the table does not know. */
  anthropicSupportOf: (model: string | undefined) => AnthropicModelSupport | undefined
  /**
   * Whether the request has to say, on the wire, that the model must not reason.
   *
   * The adaptive family reasons unless told otherwise: an absent `thinking` parameter means
   * "adaptive", and langchain forwards the parameter only when a caller sets it — so a config
   * that asks for no thinking is only honoured if the plugin sends the model's off switch itself
   * ({@link AnthropicSupportHelper.thinkingOffFor}). Silent reasoning is what the request pays for
   * twice: its tokens bill as output, and the summarised stream delivers them in bursts minutes
   * apart, which an idle deadline reads as a dead connection and retries from scratch. Older
   * models reason only when asked and get nothing.
   *
   * True also for a model that cannot be switched off: the switch is still the request's, never a
   * prompt directive, and such a model is steered by effort alone.
   */
  suppressesThinking: (config: Pick<ModelConfig, 'model' | 'disableThinking'>) => boolean
  /**
   * The `thinking.type` this config puts on the wire to turn thinking off, or `undefined` when it
   * sends none — because thinking was not turned off, or because the model refuses every off
   * switch.
   */
  thinkingOffFor: (config: Pick<ModelConfig, 'model' | 'disableThinking'>) => ThinkingOff | undefined
  /** Whether this model id answers a pinned `tool_choice` with a 400. */
  rejectsForcedTool: (model: string | undefined) => boolean
}
