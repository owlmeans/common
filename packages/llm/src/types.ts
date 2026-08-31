import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { AIMessage, BaseMessage, MessageFieldWithRole } from '@langchain/core/messages'
import type { BaseCallbackHandler, CallbackHandlerMethods } from '@langchain/core/callbacks/base'
import type { JSONSchemaType } from 'ajv'
import type { InitializedService } from '@owlmeans/context'
import type {
  FileProviderRef, LlmPurpose, ModelProvider, NullCapture, SpectatorArgument,
  SpectatorEntryLogged,
} from '@owlmeans/llm-common'
import type { PromptInput, PromptService } from './prompt/types.js'

export type MaybeArray<T> = T | T[]

/**
 * Out-of-band result channel for a model call: the caller passes a `ref` and receives
 * the raw message, the spectator entry it was logged under, and an optional callback
 * fired as soon as the value is known (before the caller's own await resolves).
 */
export interface RefferedResult<T> {
  spectatorEntry?: SpectatorEntryLogged
  value?: T
  callback?: (arg: T) => Promise<void>
}

export interface RetryOptions {
  retries: number
  outputErrors?: boolean
  /**
   * Abort the retry loop for this call. Return the error to throw, or `null` to keep
   * retrying. Consulted in addition to the globally registered resolvers
   * (`registerFatalError`) and the provider plugins' `isFatal`.
   */
  fatal?: (e: unknown) => Error | null
}

/** Decides whether an error must abort a retry loop instead of being retried. */
export interface FatalErrorResolver {
  (e: unknown): Error | null
}

export interface LlmLogging {
  /** Print every swallowed retry error to the console. */
  outputErrors?: boolean
  /** Hand a full {@link NullCapture} to the spectator when a call returns nothing usable. */
  captureNull?: boolean
  purpose: LlmPurpose
}

export interface LlmModelOptions extends LlmLogging {
  model: BaseChatModel
  retries?: number
  /**
   * Role and skills for every call this model makes. Composed into a cacheable system
   * prompt by {@link PromptService}; ignored when no `prompts` resolver is supplied.
   * Usually just `exec.prompt` from the helper execution.
   */
  prompt?: PromptInput
  /**
   * Late-bound resolver for the prompt service — a function, like `Execution.models`, so
   * the service can be swapped or cloned. Without it the model behaves exactly as before
   * this layer existed: the caller's messages are sent untouched.
   */
  prompts?: () => PromptService
  /** File access offered to prompt plugins that resolve knowledge from disk. */
  files?: FileProviderRef
}

export type ModelMessage = BaseMessage | MessageFieldWithRole
export type ModelInputItem = ModelMessage | string
export type ModelInput = MaybeArray<ModelInputItem>

export interface LlmCallOptions {
  /** Short name of the operation — used as the LangChain run name and in spectator entries. */
  action: string
  /**
   * Cache the leading MESSAGES too. The composed system prompt is cached by default and
   * independently of this flag — this one is about the conversation prefix, which is only
   * worth caching when the same leading messages recur across calls.
   */
  useCache?: boolean
  /**
   * How many leading messages form the stable prefix. One breakpoint is placed at its
   * end (not one per message), capped by whatever the system prompt left unspent.
   */
  cacheMax?: number
  /**
   * Skill aliases for THIS call only. Rendered into the volatile `Context` block, so they
   * never disturb the cached region — declare a skill on the execution instead when it
   * should be part of the shared prefix.
   */
  skills?: string[]
  /**
   * How many failures of this SAME piece of work the caller has already observed — the
   * per-call escalator starts that far up its ladder instead of at the bottom.
   *
   * A caller that validates the OUTPUT (a diff that must apply, a file that must not come
   * back truncated) runs its own retry loop around whole calls, and every one of those
   * calls used to start at attempt 0: same model, same output budget, same answer. Passing
   * the outer attempt here advances both rungs the escalator owns — the `maxTokens`
   * doubling and the {@link FALLBACK_AFTER_ATTEMPTS} switch to `ModelConfig.fallback` — so
   * a repeatedly-rejected call actually reaches the stronger model.
   *
   * Clamped to `retries - 1`; it moves the STARTING rung only and never changes how many
   * attempts this call makes. Unrelated to `ExecutionService.escalate`, which raises the
   * effort tier of an execution before any model is resolved.
   */
  escalation?: number
  /**
   * Abort THIS call's retry loop for an error no retry can fix. Consulted before the
   * globally registered resolvers and the provider plugin's `isFatal`.
   */
  fatal?: (e: unknown) => Error | null
}

export interface LlmAskOptions extends LlmCallOptions {
  ref?: RefferedResult<AIMessage>
  filter?: (output: string, result: AIMessage) => (string | null) | Promise<string | null>
}

export interface LlmTalkOptions extends LlmCallOptions {
  ref?: RefferedResult<AIMessage>
  filter?: (result: AIMessage) => Promise<AIMessage | null>
}

export interface LlmInvokeOptions<T> extends LlmCallOptions {
  temperature?: number | undefined
  ref?: RefferedResult<AIMessage>
  filter?: (output: T, result: AIMessage) => (T | null) | Promise<T | null>
}

export interface LlmRequestOptions extends LlmCallOptions {
  ref?: RefferedResult<AIMessage>
  filter?: (result: AIMessage) => Promise<AIMessage | null>
}

/**
 * The four ways to talk to a model. Every method streams under an idle deadline,
 * retries with escalating output budget, logs to the spectator and validates the result.
 *
 * - `ask` → plain text.
 * - `talk` → the raw `AIMessage`.
 * - `invoke` → a schema-validated object.
 * - `request` → an `AIMessage` whose `content` is the schema-validated JSON.
 */
export interface LlmModel {
  ask: (input: ModelInput, options: LlmAskOptions) => Promise<string>
  talk: (input: ModelInput, options: LlmTalkOptions) => Promise<AIMessage>
  invoke: <T>(input: ModelInput, schema: JSONSchemaType<T>, options: LlmInvokeOptions<T>) => Promise<T>
  request: <T>(input: ModelInput, schema: JSONSchemaType<T>, options: LlmRequestOptions) => Promise<AIMessage>
}

/**
 * Observability sink the model writes every call to. Deliberately minimal — a consumer's
 * richer spectator (with `derive`, `update`, storage backends) satisfies it structurally.
 */
export interface LlmSpectator {
  log: (arg: SpectatorArgument) => Promise<SpectatorEntryLogged>
  /** Optional sink for full diagnostics of a call that returned nothing usable. */
  captureNull?: (capture: NullCapture) => Promise<void>
}

/** Resolves a model of the same role at a different temperature. */
export interface TemperatureFactory {
  (temperature?: number | undefined): BaseChatModel
}

/**
 * Full runtime configuration of one model alias. The JSON-safe subset that may travel
 * inside an execution state is `ModelConfigPatch` (`@owlmeans/llm-common`) — this type
 * additionally carries credentials and provider wiring and must never be serialized.
 */
export interface ModelConfig {
  provider?: ModelProvider | string
  secret?: string
  alias: string
  /** Inherit every field of another alias in the same config list. */
  preset?: string
  model?: string
  temperature?: number
  /**
   * Initial output-token budget per request (`max_tokens`) — what THIS deployment asks
   * for first, not what the model can do. Clamped to {@link ModelConfig.maxOutput}.
   */
  maxTokens?: number
  /**
   * Hard ceiling for output tokens used by the retry escalator. Each retry doubles
   * `maxTokens` toward this cap; without it the escalator uses
   * {@link DEFAULT_MAX_OUTPUT_CAP}, which exceeds many models' real per-request output
   * limit and turns retries into 400 "max_tokens exceeds model limit" errors.
   *
   * This is the budget the PRESET chooses; {@link ModelConfig.maxOutput} is what the
   * provider allows. The effective ceiling is the smaller of the two, so a preset that
   * over-declares is corrected at refine time rather than at the provider.
   */
  maxTokensCap?: number
  /**
   * Total context window the model accepts — input plus output. Informational: it is
   * never sent to the provider and the runtime cannot enforce it (the input size is not
   * known at config time). It documents the model and lets the preset test catch a
   * `maxOutput` that could not possibly fit.
   */
  contextWindow?: number
  /**
   * What the PROVIDER accepts as output in a single request. Unlike `maxTokens` and
   * `maxTokensCap` — both deployment choices — this is a property of the model behind
   * this alias, and for an aggregated model it is the limit of the `inferenceProvider`
   * actually pinned here, which is often well below what the model can do elsewhere.
   *
   * Hard ceiling: `maxTokens` is clamped to it at build time and the escalator's cap is
   * `min(maxTokensCap, maxOutput)`.
   *
   * A `fallback` that changes `model` MUST redeclare this (and `contextWindow`), because
   * the fallback config inherits every field the patch does not name — otherwise the
   * escalator would size the fallback by the primary's capability.
   */
  maxOutput?: number
  /**
   * The context window is SHARED between input and output rather than being an input
   * allowance with a separate output limit (MiniMax M2.x, gpt-oss). Nothing enforces it
   * at runtime; it marks the entry so `maxOutput` is read as "spends the same budget the
   * prompt spends" and keeps presets honest about leaving room for input.
   */
  combinedWindow?: boolean
  topP?: number
  baseUrl?: string
  organization?: string
  /** Provider-routing hint for aggregators that expose one (e.g. HuggingFace). */
  inferenceProvider?: string
  headers?: Record<string, string>
  /**
   * Suppress the model's chain-of-thought / "thinking" tokens. For the Qwen3 family
   * this injects the `/no_think` soft switch into the prompt; without it those models
   * routinely spend the entire output budget on hidden reasoning and return empty
   * content with `finish_reason="length"`.
   */
  disableThinking?: boolean
  /**
   * OpenAI-compatible reasoning control, forwarded verbatim as the top-level `reasoning`
   * request-body field. Use `{ max_tokens: N }` to hard-cap the thinking budget —
   * universal, and it works even for always-reasoning models (the request `max_tokens`
   * must stay strictly higher) — or `{ effort: 'none' }` to disable thinking on hybrid
   * models that enumerate effort levels. `{ exclude: true }` keeps reasoning internal but
   * omits it from the response.
   */
  reasoning?: {
    effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    max_tokens?: number
    exclude?: boolean
    enabled?: boolean
  }
  /**
   * Force how `invoke`/`request` obtain structured output, overriding the provider
   * plugin's default: `true` → the provider's NATIVE JSON-schema mode, `false` → the
   * forced-`tool_choice` tool-calling hack. Plugins that support only one mode
   * (Anthropic — tool calling) ignore this flag.
   */
  structuredOutput?: boolean
  /**
   * Idle/inactivity timeout (ms) for a streamed response. NOT a total cap — the timer
   * resets on every chunk. Falls back to {@link MODEL_STREAM_TIMEOUT_MS}.
   */
  streamTimeout?: number
  /**
   * Stronger model the retry escalator switches to once the primary has failed
   * {@link FALLBACK_AFTER_ATTEMPTS} times. Specified inline as a partial config merged
   * over the base config, so it inherits `secret`, `headers`, etc. The escalation only
   * happens when the fallback belongs to the SAME plugin family as the primary —
   * rotating providers mid-call would flip the structured-output format.
   */
  fallback?: Partial<ModelConfig>
  /**
   * Per-model override of {@link MIN_CACHEABLE_TOKENS} — the shortest prefix worth a
   * cache breakpoint. Anthropic's own minimum is model-dependent and NOT monotonic
   * across generations (512 on the newest, 1024 on most, 4096 on a few older ones), so a
   * preset that pins an old model should raise this rather than pay for markers that
   * silently never cache.
   */
  cacheMinTokens?: number
  /**
   * Cache-routing key for providers whose prompt cache is automatic (OpenAI's
   * `prompt_cache_key`): requests sharing a key are routed to the same backend, which
   * raises the hit rate for a shared prefix. Must be STABLE and low-cardinality — one
   * value per role, never per user or per request. Defaults to the config alias.
   */
  cacheKey?: string
}

export interface LlmServiceOptions {
  /** The full config list; resolved by `alias` on every `getModel` call. */
  models: () => ModelConfig[]
  /**
   * Idle deadline (ms) applied to every model this service builds, unless the model's own
   * config overrides it. This is the knob an application sets where it composes its
   * context — one place to tune how long the whole deployment waits on a silent provider,
   * without touching a preset. Falls back to {@link MODEL_STREAM_TIMEOUT_MS}.
   */
  streamTimeout?: number
}

/**
 * Model factory and registry. Builds a `BaseChatModel` from a `ModelConfig` through the
 * registered provider plugins, memoizing per alias+override so repeated resolution of a
 * role does not rebuild the client.
 */
export interface LlmService extends InitializedService {
  models: Map<string, BaseChatModel>

  callbacks: (BaseCallbackHandler | CallbackHandlerMethods)[]

  addCallbacks: (callbacks: (BaseCallbackHandler | CallbackHandlerMethods)[]) => void

  /** Resolve (and cache) the model registered under `alias`, with an optional patch. */
  getModel: (alias: string, override?: Partial<ModelConfig>, createNew?: boolean) => BaseChatModel

  /** The configured model list, as supplied by {@link LlmServiceOptions.models}. */
  configs: () => ModelConfig[]
}

export interface WithLlmService {
  llm: () => LlmService
}
