import { ModelEffort } from '@owlmeans/llm-common'
import type { EffortSupport, AnthropicModelSupport } from './types.js'
import { ALL_EFFORTS, NO_XHIGH, UP_TO_HIGH } from './consts.local.js'

/**
 * Model families that REJECT the sampling parameters — Claude 4.7 and later, and the whole
 * 5 family. `temperature`, `top_p` and `top_k` were removed there, and sending any of them
 * is a 400, not a silently ignored field. Matched with `startsWith`, so a dated snapshot
 * (`claude-sonnet-5-20260114`) is covered by its base id.
 *
 * This is the Anthropic counterpart of the OpenAI plugin's `RESPONSES_API_PREFIXES`: the
 * older models below the line (`claude-sonnet-4-6`, `claude-haiku-4-5`, and earlier) still
 * accept sampling and still want the deterministic `temperature: 0` default.
 */
export const NO_SAMPLING_PREFIXES = [
  'claude-fable-5',
  'claude-mythos-5',
  'claude-mythos-preview',
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-sonnet-5',
]

/** The `thinking.type` a model takes to do no up-front thinking. */
export enum ThinkingOff {
  Disabled = 'disabled',
  /** Claude Sonnet 5.5: no extended thinking, only the short notes between tool calls. */
  BetweenTools = 'between_tools',
}

/**
 * Per-family facts of the Anthropic models that take `output_config.effort`, first prefix
 * match wins. From Anthropic's model pages (2026-09-29): `max` on every model below except Opus
 * 4.5, `xhigh` only on the first eleven, `medium` the default on Opus 5.5 and `high` everywhere
 * else. A model not listed (Haiku 4.5, Sonnet 4.5 and older) rejects the field, so it is never
 * sent there — and takes forced tool use and every older thinking shape.
 *
 * - **Thinking off.** Opus 5 accepts `disabled` only at `high` or below. Sonnet 5.5 refuses
 *   `disabled` and takes `between_tools` instead, again only at `high` or below, with no other
 *   field beside it. Opus 5.5 and the Fable and Mythos 5 families always think: any off switch
 *   is a 400, so the request carries none.
 * - **Forced tool use.** Opus 5.5, Sonnet 5.5, Fable 5.1 and Mythos 5.1 answer `tool_choice`
 *   `any`/`tool` with a 400; structured output asks them with `auto`, a prompt instruction naming
 *   the tool, and `strict` when the schema allows it.
 * - **Cache minimum.** 512 tokens on the 5 family, 1024 on Sonnet 5 and Opus 4.8.
 */
export const ANTHROPIC_MODEL_SUPPORT: ReadonlyArray<AnthropicModelSupport> = [
  {
    prefix: 'claude-opus-5-5', levels: ALL_EFFORTS, default: ModelEffort.Medium,
    thinkingOff: null, thinksByDefault: true, rejectsForcedTool: true, cacheMinTokens: 512,
  },
  {
    prefix: 'claude-opus-5', levels: ALL_EFFORTS, default: ModelEffort.High,
    thinkingOffCeiling: ModelEffort.High, thinksByDefault: true, cacheMinTokens: 512,
  },
  {
    prefix: 'claude-sonnet-5-5', levels: ALL_EFFORTS, default: ModelEffort.High,
    thinkingOff: ThinkingOff.BetweenTools, thinkingOffCeiling: ModelEffort.High, thinksByDefault: true,
    rejectsForcedTool: true, cacheMinTokens: 512,
  },
  {
    prefix: 'claude-fable-5-1', levels: ALL_EFFORTS, default: ModelEffort.High,
    thinkingOff: null, thinksByDefault: true, rejectsForcedTool: true, cacheMinTokens: 512,
  },
  {
    prefix: 'claude-mythos-5-1', levels: ALL_EFFORTS, default: ModelEffort.High,
    thinkingOff: null, thinksByDefault: true, rejectsForcedTool: true, cacheMinTokens: 512,
  },
  {
    prefix: 'claude-fable-5', levels: ALL_EFFORTS, default: ModelEffort.High,
    thinkingOff: null, thinksByDefault: true, cacheMinTokens: 512,
  },
  {
    prefix: 'claude-mythos-5', levels: ALL_EFFORTS, default: ModelEffort.High,
    thinkingOff: null, thinksByDefault: true, cacheMinTokens: 512,
  },
  { prefix: 'claude-opus-4-8', levels: ALL_EFFORTS, default: ModelEffort.High },
  { prefix: 'claude-opus-4-7', levels: ALL_EFFORTS, default: ModelEffort.High },
  { prefix: 'claude-sonnet-5', levels: ALL_EFFORTS, default: ModelEffort.High, thinksByDefault: true },
  { prefix: 'claude-mythos-preview', levels: NO_XHIGH, default: ModelEffort.High },
  { prefix: 'claude-opus-4-6', levels: NO_XHIGH, default: ModelEffort.High },
  { prefix: 'claude-sonnet-4-6', levels: NO_XHIGH, default: ModelEffort.High },
  { prefix: 'claude-opus-4-5', levels: UP_TO_HIGH, default: ModelEffort.High },
]

/**
 * The smallest output budget an always-reasoning model is given.
 *
 * The same models that took the sampling knobs away also think ADAPTIVELY unless the request
 * turns it off (`disableThinking` → the model's off switch, see `thinkingOffFor`), and by
 * default that thinking is not shown — it arrives as thinking blocks with empty text. Reasoning is billed against the same `max_tokens` as the answer, so a budget
 * sized for the answer alone can be spent entirely on thinking: the response is a well-formed
 * completion carrying no text at all, `stop_reason: "max_tokens"`, and every retry at the same
 * budget draws from the same distribution.
 *
 * The floor buys room for the reasoning AND the answer. It is a floor, not an override — a preset
 * asking for more keeps it — and it is clamped to what the provider accepts, so it can never turn
 * a retryable empty answer into a 400.
 */
export const ADAPTIVE_MIN_MAX_TOKENS = 32_000

export const ANTHROPIC_FAMILY = 'anthropic'

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

/**
 * The smallest output budget a request at `high` effort or above is given. Reasoning tokens
 * are billed against `max_output_tokens` together with the answer, and OpenAI's reasoning
 * guide says to reserve at least 25k for the two; below that a hard problem comes back
 * `incomplete` with no text. A floor, never an override, and clamped to the output cap.
 */
export const REASONING_MIN_MAX_TOKENS = 25_000

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
