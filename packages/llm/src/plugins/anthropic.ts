import { ChatAnthropic } from '@langchain/anthropic'
import { BadRequestError } from '@anthropic-ai/sdk'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { MessageFieldWithRole } from '@langchain/core/messages'
import { ModelProvider, StructuredMode, type CacheTtl } from '@owlmeans/llm-common'
import type { EffortSupport, LlmPlugin, AnthropicModelSupport, PromptBoundary } from './types.js'
import type { MarkDialect } from '../utils/marks/types.js'
import type { ModelConfig } from '../types.js'
import { CHARS_PER_TOKEN, MAX_CACHE_BREAKPOINTS, MIN_CACHEABLE_TOKENS } from '../consts.js'
import { configUtils } from '../utils/config.js'
import { markUtils } from '../utils/marks.js'
import { messageUtils } from '../utils/messages.js'
import { promptUtils } from '../utils/prompt.js'
import { pluginUtils } from './utils.js'
import { ANTHROPIC_AUTOMATIC_MARKER, ANTHROPIC_MARKABLE_BLOCKS, CACHEABLE_PREFIX } from './consts.local.js'
import { ADAPTIVE_MIN_MAX_TOKENS, ANTHROPIC_FAMILY, CacheDialect, type ThinkingOff } from './consts.js'
import type { AnthropicKwargs, ContentBlock, WireOutputConfig, WireThinking } from './types.local.js'
import { effortUtils } from '../utils/effort.js'
import { schemaUtils } from '../utils/schema.js'
import { anthropicSupportHelper } from './anthropic/support.js'
import { THINKING_OFF_TYPES } from './anthropic/consts.local.js'

/**
 * Make the instance's own view of `thinking` match what the request means, without touching the
 * request.
 *
 * langchain keeps a `thinking: disabled` default it never sends unless a caller set the field,
 * but its client-side parameter check reads that default anyway: an Opus 5 or 5.5 call at `xhigh`
 * or `max` with no `thinking` set throws "thinking.type=disabled is not supported" before any
 * request leaves — and a thrown local error is not a 400, so it was retried to exhaustion. On a
 * model whose absent field MEANS adaptive, the unsent default is set to what it means; what goes
 * on the wire (nothing) is unchanged.
 */
const withLocalThinking = (model: ChatAnthropic): ChatAnthropic => {
  const wire = model as unknown as { thinkingExplicitlySet?: boolean, thinking?: { type?: string } }
  if (wire.thinkingExplicitlySet !== true && anthropicSupportHelper.anthropicSupportOf(model.modelName ?? model.model)?.thinksByDefault === true) {
    wire.thinking = { type: 'adaptive' }
  }

  return model
}

const anthropicEffort = (config: Pick<ModelConfig, 'model' | 'disableThinking'>): EffortSupport | undefined => {
  const entry = anthropicSupportHelper.anthropicSupportOf(config.model)
  if (entry == null) {
    return undefined
  }
  // The ceiling binds only when the off switch is actually sent.
  const ceiling = entry.thinkingOffCeiling
  const levels = ceiling != null && anthropicSupportHelper.thinkingOffFor(config) != null
    ? entry.levels.filter(level => effortUtils.effortRank(level) <= effortUtils.effortRank(ceiling))
    : entry.levels

  return { levels, default: entry.default }
}

/**
 * The `outputConfig` for one attempt, or `undefined` to leave it as `build` wrote it. The model
 * and thinking switch are read back off the instance, since `refine` has no config — and the
 * thinking switch decides the effort ceiling.
 */
const escalatedOutputConfig = (
  model: ChatAnthropic, kwargs: AnthropicKwargs, steps: number,
): AnthropicKwargs['outputConfig'] => {
  const effort = effortUtils.effortFor(
    anthropicEffort({
      model: model.modelName ?? model.model,
      disableThinking: THINKING_OFF_TYPES.has(kwargs.thinking?.type ?? ''),
    }),
    kwargs.outputConfig?.effort,
    steps,
  )
  return effort != null ? { ...kwargs.outputConfig, effort } : undefined
}

const supportsCache = (model: BaseChatModel): boolean =>
  (model as ChatAnthropic).modelName?.startsWith(CACHEABLE_PREFIX) === true

/**
 * Shortest prefix worth a breakpoint, in characters. Anthropic silently declines to
 * create an entry below its own per-model minimum, so a marker there wastes one of the
 * four breakpoints and reports a cache that was never written.
 */
const minCacheableChars = (model: BaseChatModel, config: Partial<ModelConfig> = configUtils.readConfig(model)): number =>
  (config.cacheMinTokens
    ?? anthropicSupportHelper.anthropicSupportOf((model as ChatAnthropic).modelName)?.cacheMinTokens
    ?? MIN_CACHEABLE_TOKENS) * CHARS_PER_TOKEN

/**
 * The marker itself. `ttl` is omitted for the 5-minute default so the emitted bytes stay
 * the classic shape — a request that differs only in an explicit `"ttl": "5m"` would not
 * match a prefix cached without it.
 */
const marker = (ttl: CacheTtl): ContentBlock =>
  ttl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' }

/** Whether a message can carry a marker on its last block: a blank text or a thinking block cannot. */
const markable = (msg: MessageFieldWithRole | undefined): boolean => {
  if (msg == null) {
    return false
  }
  if (typeof msg.content === 'string') {
    return msg.content.trim() !== ''
  }
  const last = Array.isArray(msg.content) ? msg.content[msg.content.length - 1] as ContentBlock | undefined : undefined
  return last != null && ANTHROPIC_MARKABLE_BLOCKS.has(String(last.type))
}

/**
 * A copy of the message whose LAST content block carries the marker, string content lifted into
 * a block so the marker has somewhere to live. The message handed in is never edited.
 */
const markedCopy = (msg: MessageFieldWithRole, ttl: CacheTtl): MessageFieldWithRole => {
  if (typeof msg.content === 'string') {
    return messageUtils.withContent(msg, [{ type: 'text', text: msg.content, cache_control: marker(ttl) }])
  }
  const blocks = [...msg.content as ContentBlock[]]
  blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: marker(ttl) }
  return messageUtils.withContent(msg, blocks)
}

/** Anthropic's spelling of a breakpoint: `cache_control` on a content block. */
const dialect: MarkDialect = {
  block: (text, boundary) => ({
    type: 'text', text, ...(boundary != null ? { cache_control: marker(boundary.ttl) } : {}),
  }),
  message: (msg, boundary) => markedCopy(msg, boundary.ttl),
}

/** The boundaries a message list can actually carry — never the final message, the per-call payload. */
const carriable = (messages: readonly MessageFieldWithRole[], boundaries: readonly PromptBoundary[]): PromptBoundary[] =>
  boundaries.filter(boundary => boundary.message < messages.length - 1
    && (boundary.segment != null || markable(messages[boundary.message])))

export const anthropicPlugin: LlmPlugin = {
  type: ModelProvider.Anthropic,

  family: ANTHROPIC_FAMILY,

  owns: model => model instanceof ChatAnthropic,

  /**
   * Structured output is a tool call — pinned where the model allows it, asked for where it
   * does not ({@link AnthropicSupportHelper.rejectsForcedTool}). `ModelConfig.structuredOutput` is ignored.
   */
  structuredMode: () => StructuredMode.Tool,

  /**
   * Anthropic 400s on the OpenAI spelling: "tool_choice: Input tag 'function' … does not
   * match any of the expected tags: 'auto','any','tool','none'". A model that refuses a pinned
   * tool gets `auto` — the only choice left that still offers the tool.
   */
  toolChoice: (toolName: string, config?: Pick<ModelConfig, 'model'>): unknown =>
    anthropicSupportHelper.rejectsForcedTool(config?.model) ? { type: 'auto' } : { type: 'tool', name: toolName },

  pinsTool: config => !anthropicSupportHelper.rejectsForcedTool(config.model),

  /**
   * Grammar-constrained arguments stand in for the pin — but only on a schema inside the subset
   * strict tool use compiles; anything else is a 400, which no retry fixes, so it goes unstrict.
   */
  strictTool: (config, schema) => anthropicSupportHelper.rejectsForcedTool(config.model) && schemaUtils.isStrictSchema(schema),

  suppressesThinking: config => anthropicSupportHelper.suppressesThinking(config),

  effort: config => anthropicEffort(config),

  build: ({ config, secret, callbacks }) => {
    const model = config.model ??= 'claude-haiku-4-5'
    // Claude 4.7+ took the sampling knobs away: not "ignored", a 400. A configured
    // `temperature` on such a model is a preset bug, and dropping it here is the only
    // reading that keeps the call alive — there is nothing to translate it into.
    const sampling = anthropicSupportHelper.rejectsSampling(model)
      ? {}
      : {
        // Neither knob set → pin temperature to 0 for determinism.
        ...(config.temperature == null && config.topP == null ? { temperature: 0 } : {}),
        ...(config.temperature != null ? { temperature: config.temperature } : {}),
        ...(config.topP != null && config.temperature == null ? { topP: config.topP } : {}),
      }
    // Room for the reasoning these models always do, and for the answer after it.
    const requested = config.maxTokens ?? 4096
    const maxTokens = anthropicSupportHelper.rejectsSampling(model)
      ? Math.min(Math.max(requested, ADAPTIVE_MIN_MAX_TOKENS), configUtils.resolveOutputCap(config))
      : requested
    const effort = effortUtils.effortFor(
      anthropicEffort({ model, disableThinking: config.disableThinking }), config.effort, 0,
    )
    const thinkingOff = anthropicSupportHelper.thinkingOffFor({ model, disableThinking: config.disableThinking })

    const cfg = {
      model,
      apiKey: secret,
      maxTokens,
      maxRetries: 5,
      metadata: { config },
      callbacks,
      ...sampling,
      ...(thinkingOff != null ? { thinking: { type: thinkingOff } as unknown as WireThinking } : {}),
      ...(effort != null ? { outputConfig: { effort } as WireOutputConfig } : {}),
      ...pluginUtils.makeClientOptions({ headers: config.headers }),
    }
    // Anthropic rejects temperature and top_p together.
    if (cfg.temperature != null && cfg.topP != null) {
      delete cfg.topP
    }

    return withLocalThinking(new ChatAnthropic(cfg))
  },

  refine: ({ base, attempt, rungAttempt, temperature, maxOutputCap }): BaseChatModel => {
    const model = base as ChatAnthropic
    const currentTemperature = temperature ?? model.temperature ?? 0
    const maxTokens = pluginUtils.escalateMaxTokens(model.maxTokens, attempt, maxOutputCap)
    const kwargs = model.lc_kwargs as AnthropicKwargs
    // Effort is part of the cached prefix, so a climbed retry pays a cache write. A retry is
    // already the rare path, and the answer it buys is the point of retrying.
    const outputConfig = escalatedOutputConfig(model, kwargs, rungAttempt ?? attempt)
    const escalated = outputConfig != null ? { outputConfig } : {}
    // `lc_kwargs` carries whatever `build` put there, so a no-sampling model arrives clean;
    // what has to be suppressed is the escalator's own re-application of a temperature.
    if (anthropicSupportHelper.rejectsSampling(model.modelName ?? model.model)) {
      const cfg = { ...kwargs, maxTokens, ...escalated }
      delete cfg.temperature
      delete cfg.topP

      return withLocalThinking(new ChatAnthropic(cfg as Partial<ChatAnthropic>))
    }
    const cfg: Partial<ChatAnthropic> = {
      ...kwargs, temperature: currentTemperature, maxTokens, ...escalated,
    } as Partial<ChatAnthropic>
    if (cfg.temperature != null && cfg.temperature > 0 && cfg.topP != null) {
      delete cfg.topP
    } else if (cfg.temperature != null && cfg.temperature <= 0 && cfg.topP != null) {
      delete cfg.temperature
    }

    return new ChatAnthropic(cfg)
  },

  cacheDialect: () => CacheDialect.Anthropic,

  /**
   * Place `cache_control` markers on the plan's boundaries — role + skills and packages inside the
   * system message, the project message, the caller's stable lead messages — earliest first,
   * skipping a prefix below the model's minimum, within the request's budget. The final message
   * is never marked: it is the per-call payload and its tail.
   */
  patchPrompt: plan => {
    if (!supportsCache(plan.model) || plan.budget < 1) {
      return { messages: plan.messages, placed: 0 }
    }
    const chosen = markUtils.select(
      carriable(plan.messages, plan.boundaries), minCacheableChars(plan.model, plan.config), plan.budget,
    )

    return markUtils.render(plan.messages, plan.system, chosen, dialect)
  },

  /**
   * One round of a tool loop: at most three explicit markers on the stable opening (role + skills,
   * packages, the project message), never on the final message — plus Anthropic's automatic
   * top-level `cache_control`, which marks the last block of each request and so moves forward
   * round by round, reading back everything the round before it sent.
   */
  loopCache: (messages, model, hints = {}) => {
    const wire = messages.map(messageUtils.copy)
    promptUtils.stripCacheMarkers(wire)
    if (!supportsCache(model) || wire.length === 0) {
      return { messages: wire, placed: 0 }
    }
    const opening = markUtils.loopOpening(wire, hints, markUtils.resolveTtl(hints.ttl))
    const chosen = markUtils.select(
      carriable(wire, opening.boundaries), minCacheableChars(model), MAX_CACHE_BREAKPOINTS - 1,
    )
    const patch = markUtils.render(wire, opening.system, chosen, dialect)

    return { ...patch, options: { cache_control: { ...ANTHROPIC_AUTOMATIC_MARKER } } }
  },

  /**
   * A malformed request (bad schema, unsupported parameter, oversized `max_tokens`, too
   * many cache breakpoints, an input past the context window) cannot be fixed by retrying —
   * surface it immediately instead of burning the budget.
   *
   * The `isBadRequest` walk is not redundant with the `instanceof`, and neither is a plain
   * `e.status === 400`. `@langchain/anthropic` carries its OWN nested copy of
   * `@anthropic-ai/sdk`, so the error it throws is an instance of a DIFFERENT
   * `BadRequestError` class than the one imported here; and langchain additionally re-wraps
   * the failure in its own typed error (`ContextOverflowError` for an oversized prompt),
   * which holds the 400 only under `cause`. Each layer alone turned a fatal 400 into eight
   * full retries — a single unfixable request became minutes of thrash with the real cause
   * buried under the repeats.
   */
  isFatal: e => e instanceof BadRequestError || pluginUtils.isBadRequest(e) ? e as Error : null,
}

/** @deprecated compat:factory-refactor — use `anthropicSupportHelper.rejectsSampling(…)` */
export const rejectsSampling = (model: string | undefined): boolean => anthropicSupportHelper.rejectsSampling(model)

/** @deprecated compat:factory-refactor — use `anthropicSupportHelper.anthropicSupportOf(…)` */
export const anthropicSupportOf = (model: string | undefined): AnthropicModelSupport | undefined =>
  anthropicSupportHelper.anthropicSupportOf(model)

/** @deprecated compat:factory-refactor — use `anthropicSupportHelper.thinkingOffFor(…)` */
export const thinkingOffFor = (config: Pick<ModelConfig, 'model' | 'disableThinking'>): ThinkingOff | undefined =>
  anthropicSupportHelper.thinkingOffFor(config)

/** @deprecated compat:factory-refactor — use `anthropicSupportHelper.rejectsForcedTool(…)` */
export const rejectsForcedTool = (model: string | undefined): boolean => anthropicSupportHelper.rejectsForcedTool(model)
