import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseCallbackHandler, CallbackHandlerMethods } from '@langchain/core/callbacks/base'
import type { MessageContent, MessageFieldWithRole } from '@langchain/core/messages'
import type { CacheTtl, PromptBlock, StructuredMode } from '@owlmeans/llm-common'
import type { ModelConfig } from '../types.js'

export interface LlmBuildParams {
  /** Alias the config was registered under — used only for error reporting. */
  alias: string
  /**
   * Fully resolved config with the secret already stripped. Whatever the plugin puts
   * on the client as `metadata.config` is what `readConfig` later reads back, so the
   * plugin should apply its model default to this object before building.
   */
  config: ModelConfig
  secret: string
  callbacks: (BaseCallbackHandler | CallbackHandlerMethods)[]
}

export interface LlmRefineParams {
  /** The model to rebuild — the primary, or the fallback once escalation kicked in. */
  base: BaseChatModel
  /** 0-based retry attempt; the output budget doubles with it. */
  attempt: number
  /** Call-site temperature override (`invoke`). */
  temperature?: number | undefined
  /** Hard ceiling the doubled output budget is clamped to. */
  maxOutputCap: number
}

export interface LlmCacheParams {
  /** The ORIGINAL (unrefined) model — refined instances do not always keep the name. */
  model: BaseChatModel
  useCache: boolean
  /** How many leading messages form the stable prefix worth caching. */
  cacheMax: number
  /** Breakpoints the composed system prompt already spent on this request. */
  reserved?: number
  ttl?: CacheTtl
}

/** One rendered section of the composed system prompt, in emission order. */
export interface LlmSystemBlock {
  block: PromptBlock
  text: string
}

export interface LlmSystemCacheParams {
  /** The ORIGINAL (unrefined) model. */
  model: BaseChatModel
  /** Breakpoint budget the system prompt may spend. */
  cacheMax: number
  ttl: CacheTtl
}

/** Provider-native rendering of the composed system prompt. */
export interface LlmSystemRender {
  content: MessageContent
  /** Breakpoints consumed — subtracted from the message-level budget. */
  breakpoints: number
}

/**
 * Everything that differs between inference providers, in one replaceable unit.
 *
 * Registration order matters for instance-based lookup (`resolvePlugin` with no
 * `provider` in the config): the FIRST plugin whose `owns` matches wins, so the
 * conservative member of a family must be registered before the permissive one.
 * See `plugins/index.ts`.
 */
export interface LlmPlugin {
  /** Provider identifier — a `ModelProvider` value, or a custom string. */
  type: string

  /**
   * Instance behaviour group. Two plugins that construct the same client class share a
   * family (e.g. `openai` and `compatible` both produce `ChatOpenAI`). The retry
   * escalator refuses to switch to a fallback from a different family, because the
   * structured-output call shape would change mid-call.
   */
  family: string

  /** Construct the chat client from a resolved config. */
  build: (params: LlmBuildParams) => BaseChatModel

  /** Does this model instance belong to this plugin's client family? */
  owns: (model: BaseChatModel) => boolean

  /**
   * Rebuild the model for retry attempt N: raise the output budget toward
   * `maxOutputCap` and apply any provider-specific escalation (e.g. shrinking a
   * reasoning budget so the extra tokens become visible output).
   */
  refine: (params: LlmRefineParams) => BaseChatModel

  /**
   * Does this plugin turn the model's reasoning off NATIVELY when the config asks for it
   * (`ModelConfig.disableThinking`)? When it does, the service must not also inject the
   * `/no_think` prompt directive — that is a soft switch for models with no request-level
   * control, and on a provider that has one it is nothing but text in the prompt.
   */
  suppressesThinking?: (config: Pick<ModelConfig, 'model' | 'disableThinking'>) => boolean

  /** How this provider should be asked for schema-conforming output. */
  structuredMode: (config: ModelConfig) => StructuredMode

  /** Provider-specific `tool_choice` shape that pins the model to `toolName`. */
  toolChoice: (toolName: string) => unknown

  /** Provider-specific `response_format` for {@link StructuredMode.Native}. */
  responseFormat?: (toolName: string, schema: unknown) => Record<string, unknown>

  /**
   * Mark the stable message prefix as cacheable, in-place. ONE breakpoint at the end of
   * that prefix — not one per message: the budget is four per request and the system
   * prompt has first claim on it. Returns `true` when a marker was actually placed.
   * Omit for providers with no explicit prompt-cache markers.
   */
  patchCache?: (msgs: MessageFieldWithRole[], params: LlmCacheParams) => boolean

  /**
   * Render the composed system blocks into provider-native content, placing cache
   * breakpoints at the stability boundaries between blocks (see `PromptBlock`).
   *
   * Return `null` — or omit the method entirely — for providers whose prompt cache is
   * automatic and prefix-based (OpenAI and friends): the service then joins the blocks
   * into a plain string, which is all those providers need, since the block ORDER is
   * what makes their prefix stable.
   */
  patchSystem?: (blocks: LlmSystemBlock[], params: LlmSystemCacheParams) => LlmSystemRender | null

  /**
   * Classify a thrown error as fatal for the retry loop. Return the error to throw
   * immediately, or `null` to let it be retried.
   */
  isFatal?: (e: unknown) => Error | null
}
