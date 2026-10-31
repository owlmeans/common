import { ChatOpenAI } from '@langchain/openai'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { MessageFieldWithRole } from '@langchain/core/messages'
import { ModelEffort, ModelProvider, StructuredMode } from '@owlmeans/llm-common'
import type { EffortSupport, LlmPlugin, LlmRefineParams, OpenAiFamily, PromptBoundary, PromptPatch } from './types.js'
import type { ModelConfig } from '../types.js'
import { CHARS_PER_TOKEN, MAX_CACHE_BREAKPOINTS, MIN_CACHEABLE_TOKENS } from '../consts.js'
import { configUtils } from '../utils/config.js'
import { markUtils } from '../utils/marks.js'
import type { MarkDialect } from '../utils/marks/types.js'
import { messageUtils } from '../utils/messages.js'
import { promptUtils } from '../utils/prompt.js'
import { pluginUtils } from './utils.js'
import { llmTransportRegistry } from './transport.js'
import {
  CacheBoundary, CacheDialect, OPENAI_EFFORT_SUPPORT, OPENAI_EXPLICIT_CACHE_PREFIXES, OPENAI_FAMILY,
  OPENAI_HIDDEN_PROPERTY_NAMES, REASONING_MIN_MAX_TOKENS, RESPONSES_API_PREFIXES,
} from './consts.js'
import {
  OPENAI_BREAKPOINT, OPENAI_EXPLICIT_OPTIONS, OPENAI_MARKABLE_BLOCKS, OPENAI_TOOL_OUTPUT_BLOCKS,
} from './consts.local.js'
import type { ContentBlock, OpenAiKwargs } from './types.local.js'
import { effortUtils } from '../utils/effort.js'
import { schemaUtils } from '../utils/schema.js'

/** Whether this model id goes through the Responses API and therefore rejects sampling. */
export const usesResponsesApi = (model: string | undefined): boolean =>
  model != null && RESPONSES_API_PREFIXES.some(prefix => model.startsWith(prefix))

const openAiEffort = (model: string | undefined): EffortSupport | undefined => {
  const entry = model != null ? OPENAI_EFFORT_SUPPORT.find(e => model.startsWith(e.prefix)) : undefined
  return entry != null ? { levels: entry.levels, default: entry.default } : undefined
}

const withEffort = (
  modelKwargs: OpenAiKwargs['modelKwargs'], effort: ModelEffort | undefined,
): OpenAiKwargs['modelKwargs'] =>
  effort != null ? { ...modelKwargs, reasoning: { ...modelKwargs?.reasoning, effort } } : modelKwargs

const reasoningFloor = (maxTokens: number, effort: ModelEffort | undefined, cap: number): number =>
  effortUtils.effortAtLeast(effort, ModelEffort.High) ? Math.max(maxTokens, Math.min(REASONING_MIN_MAX_TOKENS, cap)) : maxTokens

/**
 * The prompt-cache mode a config is asked in. Explicit only through the Responses API, for the
 * families that take breakpoints — or wherever the preset's `cacheMode` says so.
 */
const dialectOf = (config: Partial<ModelConfig>): CacheDialect => {
  const model = config.model
  if (model == null || !usesResponsesApi(model)) {
    return CacheDialect.Implicit
  }
  if (config.cacheMode != null) {
    return config.cacheMode === 'explicit' ? CacheDialect.Explicit : CacheDialect.Implicit
  }

  return OPENAI_EXPLICIT_CACHE_PREFIXES.some(prefix => model.startsWith(prefix))
    ? CacheDialect.Explicit
    : CacheDialect.Implicit
}

const minCacheableChars = (config: Partial<ModelConfig>): number =>
  (config.cacheMinTokens ?? MIN_CACHEABLE_TOKENS) * CHARS_PER_TOKEN

/**
 * Whether the Responses converter keeps a breakpoint on this message. Never on an assistant turn:
 * its content is replayed model output and the converter drops the marker there. A tool output
 * keeps one only when every item is provider-native (`input_*`), which a text output becomes.
 */
const markable = (msg: MessageFieldWithRole | undefined): boolean => {
  if (msg == null) {
    return false
  }
  const role = messageUtils.roleOf(msg)
  if (role === 'assistant') {
    return false
  }
  if (typeof msg.content === 'string') {
    return msg.content.trim() !== ''
  }
  if (!Array.isArray(msg.content) || msg.content.length === 0) {
    return false
  }
  const blocks = msg.content as ContentBlock[]
  if (role === 'tool') {
    return blocks.every(block => block.type === 'text' || OPENAI_TOOL_OUTPUT_BLOCKS.has(String(block.type)))
  }

  return OPENAI_MARKABLE_BLOCKS.has(String(blocks[blocks.length - 1].type))
}

/** A copy of the message with the breakpoint on its last block — a tool output rewritten as `input_text`. */
const markedCopy = (msg: MessageFieldWithRole): MessageFieldWithRole => {
  const breakpoint = { prompt_cache_breakpoint: { ...OPENAI_BREAKPOINT } }
  if (messageUtils.roleOf(msg) === 'tool') {
    const items: ContentBlock[] = typeof msg.content === 'string'
      ? [{ type: 'input_text', text: msg.content }]
      : (msg.content as ContentBlock[]).map(block => block.type === 'text' ? { type: 'input_text', text: block.text } : block)
    items[items.length - 1] = { ...items[items.length - 1], ...breakpoint }
    return messageUtils.withContent(msg, items)
  }
  if (typeof msg.content === 'string') {
    return messageUtils.withContent(msg, [{ type: 'text', text: msg.content, ...breakpoint }])
  }
  const blocks = [...msg.content as ContentBlock[]]
  blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], ...breakpoint }

  return messageUtils.withContent(msg, blocks)
}

/**
 * Every tool output as provider-native `input_text` items, on copies. A marked output has to take
 * that form, so every output does: the same output must render the same way whether this request
 * marks it or not, or the prefix a later request reads back differs from the one written.
 */
const nativeToolOutputs = (messages: readonly MessageFieldWithRole[]): MessageFieldWithRole[] =>
  messages.map(msg => messageUtils.roleOf(msg) === 'tool' && typeof msg.content === 'string' && msg.content.trim() !== ''
    ? messageUtils.withContent(msg, [{ type: 'input_text', text: msg.content }])
    : msg)

/** OpenAI's spelling of a breakpoint: `prompt_cache_breakpoint` on an input block. */
const dialect: MarkDialect = {
  block: (text, boundary) => ({
    type: 'text', text, ...(boundary != null ? { prompt_cache_breakpoint: { ...OPENAI_BREAKPOINT } } : {}),
  }),
  message: msg => markedCopy(msg),
}

/**
 * Each message boundary moved back to the nearest message that keeps a marker — past an assistant
 * turn — but never onto or before the boundary in front of it, which already covers that prefix.
 */
const movedBack = (messages: readonly MessageFieldWithRole[], boundaries: readonly PromptBoundary[]): PromptBoundary[] => {
  const out: PromptBoundary[] = []
  let floor = -1
  for (const boundary of boundaries) {
    if (boundary.message === 0 && boundary.segment != null) {
      out.push(boundary)
      floor = 0
      continue
    }
    let at = boundary.message
    while (at > floor && !markable(messages[at])) {
      at--
    }
    if (at <= floor) {
      continue
    }
    out.push(at === boundary.message
      ? boundary
      : { ...boundary, message: at, prefixChars: messageUtils.charsThrough(messages, at) })
    floor = at
  }

  return out
}

/** Explicit mode is asked for only with a breakpoint in place: explicit with none caches nothing. */
const explicit = (patch: PromptPatch): PromptPatch => patch.placed > 0
  ? { ...patch, options: { promptCacheOptions: { ...OPENAI_EXPLICIT_OPTIONS.promptCacheOptions } } }
  : patch

/** The last message at or before `from` that keeps a marker, or -1. */
const markableAt = (messages: readonly MessageFieldWithRole[], from: number): number => {
  let at = from
  while (at >= 0 && (messageUtils.roleOf(messages[at]) === 'assistant' || !markable(messages[at]))) {
    at--
  }
  return at
}

/** Every plugin that constructs a `ChatOpenAI` shares these instance-level behaviours. */
export const openAiFamily: OpenAiFamily = {
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
  isFatal: (e: unknown): Error | null => pluginUtils.isBadRequest(e) ? e as Error : null,

  refine: ({ base, attempt, rungAttempt, temperature, maxOutputCap }: LlmRefineParams): BaseChatModel => {
    const model = base as ChatOpenAI
    const currentTemperature = temperature ?? model.temperature ?? 0
    const baseKwargs = model.lc_kwargs as OpenAiKwargs
    const responsesApi = usesResponsesApi(model.model ?? baseKwargs.model)
      || baseKwargs.useResponsesApi === true
    // Effort only where `build` chose the Responses API itself — the `compatible` plugin
    // shares this hook and speaks an aggregator's `reasoning` dialect instead.
    const effort = baseKwargs.useResponsesApi === true
      ? effortUtils.effortFor(
        openAiEffort(model.model ?? baseKwargs.model),
        baseKwargs.modelKwargs?.reasoning?.effort as ModelEffort | undefined,
        rungAttempt ?? attempt,
      )
      : undefined
    const maxTokens = reasoningFloor(
      pluginUtils.escalateMaxTokens(model.maxTokens, attempt, maxOutputCap), effort, maxOutputCap,
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

  cacheDialect: config => dialectOf(config),

  /**
   * Explicit mode (GPT-5.6+ through the Responses API): `prompt_cache_breakpoint` on the plan's
   * boundaries — system segments, the project message, the caller's stable lead messages moved
   * back past any assistant turn — and `promptCacheOptions: { mode: 'explicit' }` on the request,
   * only when something was placed. Nothing else is written, so the per-call tail is billed once.
   * Implicit mode is left to the order of the bytes.
   */
  patchPrompt: plan => {
    if (dialectOf(plan.config) !== CacheDialect.Explicit || plan.budget < 1) {
      return { messages: plan.messages, placed: 0 }
    }
    const messages = nativeToolOutputs(plan.messages)
    const usable = movedBack(messages, plan.boundaries)
      .filter(boundary => boundary.message < messages.length - 1)
    const chosen = markUtils.select(usable, minCacheableChars(plan.config), plan.budget)

    return explicit(markUtils.render(messages, plan.system, chosen, dialect))
  },

  /**
   * One round of a tool loop in explicit mode: the system at its boundaries, then the last input of
   * the previous round (what this round reads back) and this round's last input (what the next one
   * will). At most four; the project message yields first, the packages segment next.
   */
  loopCache: (messages, model, hints = {}) => {
    const copies = messages.map(messageUtils.copy)
    promptUtils.stripCacheMarkers(copies)
    const config = configUtils.readConfig(model)
    const id = config.model ?? (model as ChatOpenAI).model
    if (copies.length === 0 || dialectOf({ ...config, model: id }) !== CacheDialect.Explicit) {
      return { messages: copies, placed: 0 }
    }
    const wire = nativeToolOutputs(copies)
    const opening = markUtils.loopOpening(wire, hints, markUtils.resolveTtl(hints.ttl))
    const openedAt = opening.boundaries.reduce((at, boundary) => Math.max(at, boundary.message), 0)
    const last = markableAt(wire, wire.length - 1)
    let answered = last - 1
    while (answered > openedAt && messageUtils.roleOf(wire[answered]) !== 'assistant') {
      answered--
    }
    const previous = answered > openedAt ? markableAt(wire, answered - 1) : -1
    const ttl = markUtils.resolveTtl(hints.ttl).stable
    const rounds = [previous, last]
      .filter((at, i, all) => at > openedAt && all.indexOf(at) === i)
      .map(at => ({ kind: CacheBoundary.Stable, message: at, ttl, prefixChars: messageUtils.charsThrough(wire, at) }))
    const chosen = markUtils.select(
      movedBack(wire, [...opening.boundaries, ...rounds]), minCacheableChars({ ...config, model: id }), Infinity,
    )
    for (const kind of [CacheBoundary.Project, CacheBoundary.Packages, CacheBoundary.Skills]) {
      while (chosen.length > MAX_CACHE_BREAKPOINTS && chosen.some(boundary => boundary.kind === kind)) {
        chosen.splice(chosen.findIndex(boundary => boundary.kind === kind), 1)
      }
    }

    return explicit(markUtils.render(wire, opening.system, chosen, dialect))
  },

  schemaDefects: (config, schema) =>
    config.structuredOutput === false ? [] : schemaUtils.hiddenPropertyNames(schema, OPENAI_HIDDEN_PROPERTY_NAMES),

  build: ({ alias, config, secret, callbacks }) => {
    const model = config.model ??= 'gpt-5.4-mini'
    const configuration = pluginUtils.makeConfiguration({
      baseURL: undefined,
      headers: config.headers,
      fetch: llmTransportRegistry.fetchFor({ provider: ModelProvider.OpenAI, alias, config }),
    })

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
      const effort = effortUtils.effortFor(openAiEffort(model), config.effort, 0)
      return new ChatOpenAI({
        model,
        apiKey: secret,
        maxTokens: reasoningFloor(config.maxTokens ?? 4096, effort, configUtils.resolveOutputCap(config)),
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
