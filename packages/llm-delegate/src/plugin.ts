import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ModelProvider, StructuredMode } from '@owlmeans/llm-common'
import type { LlmPlugin } from '@owlmeans/llm'
import { registerLlmPlugin } from '@owlmeans/llm'
import { DELEGATED_MODEL_PREFIX } from './consts.js'
import { DelegateUnavailable } from './errors.js'
import { DelegatedChatModel } from './model.js'

/** `delegated:strong` → `strong`. A config with no tier gets the standard one. */
const tierOf = (model: string | undefined): string =>
  model != null && model.startsWith(DELEGATED_MODEL_PREFIX)
    ? model.slice(DELEGATED_MODEL_PREFIX.length)
    : 'standard'

/**
 * The delegated provider.
 *
 * Its whole job is to say that "which model" and "which endpoint" are separable questions: every
 * hook here answers for a call that has no endpoint at all.
 */
export const delegatedPlugin: LlmPlugin = {
  type: ModelProvider.Delegated,

  /**
   * Its own family, so the retry escalator never swaps a delegated model for a real one.
   *
   * A fallback across families changes the structured-output call shape mid-run, which is why the
   * escalator refuses it — and here it would also change who is billed for the work.
   */
  family: 'delegated',

  build: ({ config, callbacks }) => new DelegatedChatModel({
    delegate: config.delegate ?? '',
    tier: tierOf(config.model),
    role: config.alias,
    model: config.model,
    callbacks,
    metadata: { config },
  }),

  owns: (model: BaseChatModel) => model instanceof DelegatedChatModel,

  /**
   * Retry the same performer, told that this is a retry.
   *
   * Nothing else can usefully change: there is no output budget to raise (the performer's model
   * has its own) and no endpoint to move to. What the attempt number buys is a performer that can
   * see it is being asked again — and, for a coding agent, that its previous answer was refused.
   */
  refine: ({ base, attempt }) => base instanceof DelegatedChatModel && attempt > 0
    ? base.withAttempt(attempt)
    : base,

  /**
   * Structured output as a pinned tool call.
   *
   * The same mechanism the tool-calling providers use, and the reason the model turns a `Json`
   * answer back into a tool call: the runtime reads its structured result off the call, so an
   * answer delivered as text would be a shape the caller never asked for.
   */
  structuredMode: () => StructuredMode.Tool,

  toolChoice: (toolName: string) => ({ name: toolName }),

  /**
   * A performer has no reasoning knob this stack can set — it is a whole agent with its own
   * settings. Claiming to suppress reasoning natively keeps the runtime from appending a
   * `/no_think` directive that would just be text in somebody else's prompt.
   */
  suppressesThinking: () => true,

  isFatal: (e: unknown) => e instanceof DelegateUnavailable ? e : null,
}

registerLlmPlugin(delegatedPlugin)
