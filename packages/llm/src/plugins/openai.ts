import { ChatOpenAI } from '@langchain/openai'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ModelProvider, StructuredMode } from '@owlmeans/llm-common'
import type { LlmPlugin, LlmRefineParams } from './types.js'
import type { ModelConfig } from '../types.js'
import { escalateMaxTokens, makeConfiguration } from './utils.js'

/** Model families served through OpenAI's Responses API rather than chat completions. */
const RESPONSES_API_PREFIXES = ['gpt-5', 'codex-']

export const OPENAI_FAMILY = 'openai'

/** Every plugin that constructs a `ChatOpenAI` shares these instance-level behaviours. */
export const openAiFamily = {
  family: OPENAI_FAMILY,

  owns: (model: BaseChatModel): boolean => model instanceof ChatOpenAI,

  /**
   * langchain converts the OpenAI-shaped tool DEFINITION for either provider, but the
   * `tool_choice` shape is NOT converted — this is the OpenAI spelling.
   */
  toolChoice: (toolName: string): unknown => ({ type: 'function', function: { name: toolName } }),

  /**
   * `strict: false` keeps schemas that do not satisfy OpenAI strict-mode rules
   * acceptable; the model's own ajv validation still enforces conformance afterwards.
   * With `provider.require_parameters` already set, sending `response_format` also makes
   * an aggregator route only to providers that actually support structured outputs.
   */
  responseFormat: (toolName: string, schema: unknown): Record<string, unknown> => ({
    type: 'json_schema',
    json_schema: { name: toolName, schema, strict: false },
  }),

  /**
   * A 400 means the request itself is malformed — a schema the endpoint rejects, an
   * unsupported parameter, a `max_tokens` above the model's per-request limit. Retrying
   * re-sends the same shape (and the escalator raises `max_tokens`, making the last case
   * strictly worse), so eight attempts only bury the real message. Matched on `status`
   * rather than an SDK class: aggregators and nested SDK copies throw their own error
   * types, and an `instanceof` against one of them silently never matches.
   */
  isFatal: (e: unknown): Error | null =>
    (e as { status?: unknown })?.status === 400 ? e as Error : null,

  refine: ({ base, attempt, temperature, maxOutputCap }: LlmRefineParams): BaseChatModel => {
    const model = base as ChatOpenAI
    const currentTemperature = temperature ?? model.temperature ?? 0
    const maxTokens = escalateMaxTokens(model.maxTokens, attempt, maxOutputCap)
    const baseKwargs = model.lc_kwargs as ConstructorParameters<typeof ChatOpenAI>[0] & {
      modelKwargs?: { reasoning?: { max_tokens?: number } } & Record<string, unknown>
    }
    // The dominant cause of an empty response is a reasoning model spending the whole
    // budget on hidden thinking (finish_reason=length, empty content). The retry already
    // raises maxTokens; ALSO shrink the absolute reasoning cap so the extra budget becomes
    // visible output instead of more reasoning. Only touches `{ max_tokens: N }` reasoning
    // configs — effort/enabled/exclude shapes are left untouched.
    const reasoning = baseKwargs.modelKwargs?.reasoning
    const modelKwargs = attempt > 0 && typeof reasoning?.max_tokens === 'number'
      ? {
        ...baseKwargs.modelKwargs,
        reasoning: { ...reasoning, max_tokens: Math.max(256, Math.floor(reasoning.max_tokens / Math.pow(2, attempt))) },
      }
      : baseKwargs.modelKwargs

    return new ChatOpenAI({
      ...baseKwargs,
      temperature: currentTemperature,
      maxTokens,
      ...(modelKwargs != null ? { modelKwargs } : {}),
    })
  },
}

/**
 * Proprietary OpenAI endpoint. Defaults to the provider's NATIVE JSON-schema mode for
 * structured output — it is reliable there, unlike on the long tail of
 * OpenAI-compatible endpoints (see the `compatible` plugin).
 */
export const openAiPlugin: LlmPlugin = {
  ...openAiFamily,

  type: ModelProvider.OpenAI,

  structuredMode: (config: ModelConfig): StructuredMode =>
    config.structuredOutput === false ? StructuredMode.Tool : StructuredMode.Native,

  build: ({ alias, config, secret, callbacks }) => {
    const model = config.model ??= 'gpt-5.4-mini'
    const configuration = makeConfiguration({ baseURL: undefined, headers: config.headers })

    // OpenAI's prompt cache is automatic and prefix-based — there is nothing to mark. The
    // one lever a client has is routing: requests are dispatched by a hash of the prompt's
    // opening tokens, and `prompt_cache_key` is mixed into that hash, so requests sharing
    // a key land on the same backend and can actually hit each other's entries. The key
    // must be stable and low-cardinality; the config alias IS the role, which is exactly
    // the granularity at which a system prefix is shared.
    //
    // Deliberately NOT done for the `compatible` plugin: aggregators there run with
    // `provider.require_parameters`, and an unknown top-level field can exclude every
    // serving provider from the route.
    const modelKwargs = { prompt_cache_key: config.cacheKey ?? alias }

    // The Responses API models reject `temperature`/`topP`.
    if (RESPONSES_API_PREFIXES.some(prefix => model.startsWith(prefix))) {
      return new ChatOpenAI({
        model,
        apiKey: secret,
        maxTokens: config.maxTokens ?? 4096,
        maxRetries: 5,
        useResponsesApi: true,
        metadata: { config },
        callbacks,
        modelKwargs,
        ...configuration,
      })
    }

    return new ChatOpenAI({
      model,
      apiKey: secret,
      temperature: config.temperature ?? 0,
      maxTokens: config.maxTokens ?? 4096,
      topP: config.topP ?? 0.8,
      maxRetries: 5,
      metadata: { config },
      callbacks,
      modelKwargs,
      ...configuration,
    })
  },
}
