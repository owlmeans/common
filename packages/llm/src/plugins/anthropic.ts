import { ChatAnthropic } from '@langchain/anthropic'
import { BadRequestError } from '@anthropic-ai/sdk'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { MessageContent, MessageFieldWithRole } from '@langchain/core/messages'
import { ModelProvider, PromptBlock, StructuredMode, type CacheTtl } from '@owlmeans/llm-common'
import type { EffortSupport, LlmPlugin, AnthropicModelSupport } from './types.js'
import type { ModelConfig } from '../types.js'
import { CHARS_PER_TOKEN, MAX_CACHE_BREAKPOINTS, MIN_CACHEABLE_TOKENS } from '../consts.js'
import { configUtils } from '../utils/config.js'
import { pluginUtils } from './utils.js'
import { CACHEABLE_PREFIX } from './consts.local.js'
import { ADAPTIVE_MIN_MAX_TOKENS, ANTHROPIC_FAMILY, type ThinkingOff } from './consts.js'
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
const minCacheableChars = (model: BaseChatModel): number =>
  (configUtils.readConfig(model).cacheMinTokens
    ?? anthropicSupportHelper.anthropicSupportOf((model as ChatAnthropic).modelName)?.cacheMinTokens
    ?? MIN_CACHEABLE_TOKENS) * CHARS_PER_TOKEN

/**
 * The marker itself. `ttl` is omitted for the 5-minute default so the emitted bytes stay
 * the classic shape — a request that differs only in an explicit `"ttl": "5m"` would not
 * match a prefix cached without it.
 */
const marker = (ttl: CacheTtl): ContentBlock =>
  ttl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' }

const contentLength = (content: MessageContent | undefined): number => {
  if (typeof content === 'string') {
    return content.length
  }
  if (Array.isArray(content)) {
    return content.reduce<number>((sum, part) => {
      const text = (part as unknown as { text?: unknown }).text
      return sum + (typeof text === 'string' ? text.length : 0)
    }, 0)
  }
  return 0
}

/**
 * Put a breakpoint on a message's LAST content block, lifting string content into a block
 * so the marker has somewhere to live. Idempotent, and it never mutates a block the
 * caller owns — the array is rebuilt around a fresh copy of the final entry.
 */
const markMessage = (msg: MessageFieldWithRole, mark: ContentBlock): boolean => {
  if (typeof msg.content === 'string') {
    msg.content = [{ type: 'text', text: msg.content, cache_control: mark }] as unknown as MessageContent
    return true
  }
  if (Array.isArray(msg.content) && msg.content.length > 0) {
    const blocks = [...msg.content] as ContentBlock[]
    const last = blocks[blocks.length - 1]
    if (last.cache_control != null) {
      return true
    }
    blocks[blocks.length - 1] = { ...last, cache_control: mark }
    msg.content = blocks as unknown as MessageContent
    return true
  }

  return false
}

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

  /**
   * Render the composed system prompt as Anthropic content blocks, one per section, with
   * a breakpoint on each stability boundary:
   *
   * - after `Role` + `Skills` — the region every call of this role shares;
   * - after `Packages`        — varies with what the request mentions, so it gets its own
   *                             entry and can never invalidate the block above it;
   * - after the last block    — so the whole system prompt is cached, which is the
   *                             default this layer promises.
   *
   * Boundaries that coincide collapse into one. Marking stops as soon as the budget is
   * spent, earliest boundary first — the earliest prefix is the one most calls share.
   */
  patchSystem: (blocks, { model, cacheMax, ttl }) => {
    const content: ContentBlock[] = blocks.map(block => ({ type: 'text', text: block.text }))
    if (!supportsCache(model) || cacheMax < 1) {
      return { content: content as unknown as MessageContent, breakpoints: 0 }
    }

    const lastOf = (...wanted: PromptBlock[]): number =>
      blocks.reduce((found, block, i) => wanted.includes(block.block) ? i : found, -1)

    // Closing the prompt is worth a breakpoint only when the last block is STABLE. A
    // trailing `Context` changes every call, so marking it would pay a cache write every
    // time and never read one back — it burns a breakpoint to buy nothing. A prompt that
    // is ONLY context (a caller that has not adopted role/skills) is still worth marking,
    // because there it IS the stable part.
    const last = blocks.length - 1
    const closing = blocks[last].block === PromptBlock.Context && blocks.length > 1 ? -1 : last

    const boundaries = [...new Set([
      lastOf(PromptBlock.Role, PromptBlock.Skills),
      lastOf(PromptBlock.Packages),
      closing,
    ].filter(index => index >= 0))].sort((a, b) => a - b)

    const minChars = minCacheableChars(model)
    let consumed = 0
    let chars = 0
    let next = 0
    for (let i = 0; i < content.length; i++) {
      chars += blocks[i].text.length
      if (i !== boundaries[next]) {
        continue
      }
      next++
      if (chars < minChars || consumed >= cacheMax) {
        continue
      }
      content[i].cache_control = marker(ttl)
      consumed++
    }

    return { content: content as unknown as MessageContent, breakpoints: consumed }
  },

  /**
   * One breakpoint, at the end of the stable message prefix (`cacheMax` messages).
   *
   * Not one marker per message: the request budget is {@link MAX_CACHE_BREAKPOINTS} in
   * total across tools, system and messages, and the system prompt — the part that is
   * genuinely identical between calls — has first claim on it. `reserved` is what the
   * system prompt already spent.
   */
  patchCache: (msgs, { model, useCache, cacheMax, reserved = 0, ttl = '5m' }) => {
    if (!useCache || !supportsCache(model) || msgs.length === 0) {
      return false
    }
    if (Math.min(cacheMax, MAX_CACHE_BREAKPOINTS - reserved) < 1) {
      return false
    }

    // The final message is the per-call payload, and `ensureJsonMention` / `applyNoThink`
    // append to it — including it in the prefix would write a fresh entry every call and
    // read none. The stable prefix therefore stops one short of the end.
    const index = Math.min(cacheMax, msgs.length - 1) - 1
    const target = index >= 0 ? msgs[index] : null
    if (target == null) {
      return false
    }
    const chars = msgs.slice(0, index + 1)
      .reduce((sum, msg) => sum + contentLength(msg.content), 0)
    if (chars < minCacheableChars(model)) {
      return false
    }

    return markMessage(target, marker(ttl))
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
