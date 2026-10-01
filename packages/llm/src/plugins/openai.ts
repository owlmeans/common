import { ChatOpenAI } from '@langchain/openai'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ModelEffort, ModelProvider, StructuredMode } from '@owlmeans/llm-common'
import type { EffortSupport, LlmPlugin, LlmRefineParams } from './types.js'
import type { ModelConfig } from '../types.js'
import { resolveOutputCap } from '../utils/config.js'
import { effortAtLeast, effortFor } from '../utils/effort.js'
import { escalateMaxTokens, isBadRequest, makeConfiguration } from './utils.js'
import { hiddenPropertyNames } from '../utils/schema.js'

/**
 * Model families served through OpenAI's Responses API rather than chat completions. That
 * endpoint REJECTS `temperature`/`top_p` — a 400 naming the parameter, not a silently
 * ignored field. Matched with `startsWith`, so a dated snapshot (`gpt-5.6-terra-2026-08`)
 * is covered by its base id.
 *
 * This is the OpenAI counterpart of the anthropic plugin's `NO_SAMPLING_PREFIXES`, and it
 * gates BOTH hooks for the same reason: see `refine`. The Responses API is also the only
 * route that combines function calling with reasoning on `gpt-6*` — chat completions allows
 * tools there only at `reasoning_effort: none`.
 */
export const RESPONSES_API_PREFIXES = ['gpt-6', 'gpt-5', 'codex-']

/** Whether this model id goes through the Responses API and therefore rejects sampling. */
export const usesResponsesApi = (model: string | undefined): boolean =>
  model != null && RESPONSES_API_PREFIXES.some(prefix => model.startsWith(prefix))

/**
 * `reasoning.effort` levels per model, first prefix match wins. From OpenAI's model pages
 * (2026-09-23): `gpt-6-sol` / `gpt-6-luna` accept `none`…`max` and default to `medium`;
 * `gpt-6-astra` answers `none` with a 400. Ids not listed get no effort at all — the `gpt-5*`
 * snapshots accept different sets, and a guessed level is a fatal 400.
 */
export const OPENAI_EFFORT_SUPPORT: ReadonlyArray<EffortSupport & { prefix: string }> = [
  {
    prefix: 'gpt-6-astra',
    levels: [ModelEffort.Low, ModelEffort.Medium, ModelEffort.High, ModelEffort.XHigh, ModelEffort.Max],
    default: ModelEffort.Medium,
  },
  {
    prefix: 'gpt-6',
    levels: [
      ModelEffort.None, ModelEffort.Low, ModelEffort.Medium, ModelEffort.High, ModelEffort.XHigh,
      ModelEffort.Max,
    ],
    default: ModelEffort.Medium,
  },
]

const openAiEffort = (model: string | undefined): EffortSupport | undefined => {
  const entry = model != null ? OPENAI_EFFORT_SUPPORT.find(e => model.startsWith(e.prefix)) : undefined
  return entry != null ? { levels: entry.levels, default: entry.default } : undefined
}

/**
 * The request's `reasoning` object travels in `modelKwargs`, never in the constructor's
 * `reasoning` field. `@langchain/openai` puts that field on the wire only for model names it
 * recognises as reasoning models (`o*`, `gpt-5*`), so on `gpt-6-*` a configured effort was
 * silently dropped from every request. `modelKwargs` is spread verbatim into the Responses body
 * for every model, and langchain adds its own `reasoning` key only when the constructor field (or
 * a call option) is set — which this plugin never does — so the key goes out exactly once.
 */
type OpenAiKwargs = ConstructorParameters<typeof ChatOpenAI>[0] & {
  modelKwargs?: { reasoning?: { max_tokens?: number, effort?: string } & Record<string, unknown> } & Record<string, unknown>
}

const withEffort = (
  modelKwargs: OpenAiKwargs['modelKwargs'], effort: ModelEffort | undefined,
): OpenAiKwargs['modelKwargs'] =>
  effort != null ? { ...modelKwargs, reasoning: { ...modelKwargs?.reasoning, effort } } : modelKwargs

/**
 * The smallest output budget a request at `high` effort or above is given. Reasoning tokens
 * are billed against `max_output_tokens` together with the answer, and OpenAI's reasoning
 * guide says to reserve at least 25k for the two; below that a hard problem comes back
 * `incomplete` with no text. A floor, never an override, and clamped to the output cap.
 */
export const REASONING_MIN_MAX_TOKENS = 25_000

const reasoningFloor = (maxTokens: number, effort: ModelEffort | undefined, cap: number): number =>
  effortAtLeast(effort, ModelEffort.High) ? Math.max(maxTokens, Math.min(REASONING_MIN_MAX_TOKENS, cap)) : maxTokens

export const OPENAI_FAMILY = 'openai'

/**
 * Property NAMES OpenAI never shows the model in a NON-strict `json_schema` response format — the
 * one this plugin sends (`strict: false`). The Responses API renders that schema into the prompt
 * with JSON-schema keywords stripped by KEY, anywhere in the tree, a `properties` map included: a
 * property named like one of these is removed from what the model sees, never answered, and a
 * schema that requires it fails validation on every retry. Measured on `gpt-6-sol` / `gpt-6-luna`
 * (2026-09-29); `type`, `properties`, `items`, `enum`, `const`, `description`, `title`,
 * `nullable`, `anyOf`, `oneOf`, `$ref`, `$id`, `$defs`, `definitions`, `prefixItems` and
 * `discriminator` survive. Function calling (`structuredOutput: false`) keeps every name.
 */
export const OPENAI_HIDDEN_PROPERTY_NAMES: ReadonlySet<string> = new Set([
  'required', 'default', 'format', 'pattern', 'additionalProperties', 'examples', 'deprecated',
  'readOnly', 'writeOnly', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
  'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems', 'minProperties',
  'maxProperties', 'allOf', 'not', 'if', 'then', 'else', 'contains', 'propertyNames',
  'patternProperties', 'dependentRequired', 'unevaluatedProperties',
])

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
   * unsupported parameter, a `max_tokens` above the model's per-request limit, an input
   * past the context window. Retrying re-sends the same shape (and the escalator raises
   * `max_tokens`, making some of those strictly worse), so eight attempts only bury the
   * real message. Matched through `isBadRequest` rather than an SDK class: aggregators and
   * nested SDK copies throw their own error types, and langchain re-wraps the failure in a
   * typed error that keeps the 400 only under `cause` — so both an `instanceof` and a
   * surface `status` read silently miss it.
   */
  isFatal: (e: unknown): Error | null => isBadRequest(e) ? e as Error : null,

  refine: ({ base, attempt, rungAttempt, temperature, maxOutputCap }: LlmRefineParams): BaseChatModel => {
    const model = base as ChatOpenAI
    const currentTemperature = temperature ?? model.temperature ?? 0
    const baseKwargs = model.lc_kwargs as OpenAiKwargs
    const responsesApi = usesResponsesApi(model.model ?? baseKwargs.model)
      || baseKwargs.useResponsesApi === true
    // Effort only where `build` chose the Responses API itself — the `compatible` plugin
    // shares this hook and speaks an aggregator's `reasoning` dialect instead.
    const effort = baseKwargs.useResponsesApi === true
      ? effortFor(
        openAiEffort(model.model ?? baseKwargs.model),
        baseKwargs.modelKwargs?.reasoning?.effort as ModelEffort | undefined,
        rungAttempt ?? attempt,
      )
      : undefined
    const maxTokens = reasoningFloor(
      escalateMaxTokens(model.maxTokens, attempt, maxOutputCap), effort, maxOutputCap,
    )
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

    // `build` hands a Responses-API model over without sampling knobs, but EVERY call is
    // made on the instance `refine` returns — attempt 0 included — so re-applying a
    // temperature here puts it on the wire for every single request, not just a retry.
    // Suppressing it in one hook and restoring it in the other ships the parameter anyway.
    if (responsesApi) {
      const kwargs = withEffort(modelKwargs, effort)
      const cfg = {
        ...baseKwargs,
        maxTokens,
        ...(kwargs != null ? { modelKwargs: kwargs } : {}),
      }
      delete cfg.temperature
      delete cfg.topP
      // The constructor field is the one langchain drops on `gpt-6-*` — never set it.
      delete cfg.reasoning

      return new ChatOpenAI(cfg)
    }

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

  effort: config => openAiEffort(config.model),

  schemaDefects: (config, schema) =>
    config.structuredOutput === false ? [] : hiddenPropertyNames(schema, OPENAI_HIDDEN_PROPERTY_NAMES),

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
    if (usesResponsesApi(model)) {
      const effort = effortFor(openAiEffort(model), config.effort, 0)
      return new ChatOpenAI({
        model,
        apiKey: secret,
        maxTokens: reasoningFloor(config.maxTokens ?? 4096, effort, resolveOutputCap(config)),
        maxRetries: 5,
        useResponsesApi: true,
        metadata: { config },
        callbacks,
        modelKwargs: withEffort(modelKwargs, effort),
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
