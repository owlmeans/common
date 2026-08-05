import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { AIMessage, BaseMessage, MessageFieldWithRole } from '@langchain/core/messages'
import type { BaseCallbackHandler, CallbackHandlerMethods } from '@langchain/core/callbacks/base'
import type { JSONSchemaType } from 'ajv'
import type { InitializedService } from '@owlmeans/context'
import type {
  LlmPurpose, ModelProvider, NullCapture, SpectatorArgument, SpectatorEntryLogged,
} from '@owlmeans/llm-common'

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
}

export type ModelMessage = BaseMessage | MessageFieldWithRole
export type ModelInputItem = ModelMessage | string
export type ModelInput = MaybeArray<ModelInputItem>

export interface LlmCallOptions {
  /** Short name of the operation — used as the LangChain run name and in spectator entries. */
  action: string
  /** Ask the provider to cache the prompt prefix (no-op for providers without prompt caching). */
  useCache?: boolean
  /** How many leading messages to mark as cacheable (capped by the provider's own limit). */
  cacheMax?: number
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
  /** Initial output-token budget per request (`max_tokens`). */
  maxTokens?: number
  /**
   * Hard ceiling for output tokens used by the retry escalator. Each retry doubles
   * `maxTokens` toward this cap; without it the escalator uses
   * {@link DEFAULT_MAX_OUTPUT_CAP}, which exceeds many models' real per-request output
   * limit and turns retries into 400 "max_tokens exceeds model limit" errors.
   */
  maxTokensCap?: number
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
}

export interface LlmServiceOptions {
  /** The full config list; resolved by `alias` on every `getModel` call. */
  models: () => ModelConfig[]
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
