import { ChatAnthropic } from '@langchain/anthropic'
import { BadRequestError } from '@anthropic-ai/sdk'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { MessageContent, MessageFieldWithRole } from '@langchain/core/messages'
import { ModelEffort, ModelProvider, PromptBlock, StructuredMode } from '@owlmeans/llm-common'
import type { CacheTtl } from '@owlmeans/llm-common'
import type { EffortSupport, LlmPlugin } from './types.js'
import type { ModelConfig } from '../types.js'
import { CHARS_PER_TOKEN, MAX_CACHE_BREAKPOINTS, MIN_CACHEABLE_TOKENS } from '../consts.js'
import { resolveOutputCap } from '../utils/config.js'
import { readConfig } from '../utils/config.js'
import { effortFor, effortRank } from '../utils/effort.js'
import { escalateMaxTokens, isBadRequest, makeClientOptions } from './utils.js'
import { isStrictSchema } from '../utils/schema.js'

/** Model-name prefix that supports prompt caching through `cache_control` markers. */
const CACHEABLE_PREFIX = 'claude-'

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

/** Whether this model id rejects `temperature`/`top_p`/`top_k`. */
export const rejectsSampling = (model: string | undefined): boolean =>
  model != null && NO_SAMPLING_PREFIXES.some(prefix => model.startsWith(prefix))

const ALL_EFFORTS = [ModelEffort.Low, ModelEffort.Medium, ModelEffort.High, ModelEffort.XHigh, ModelEffort.Max]
const NO_XHIGH = [ModelEffort.Low, ModelEffort.Medium, ModelEffort.High, ModelEffort.Max]
const UP_TO_HIGH = [ModelEffort.Low, ModelEffort.Medium, ModelEffort.High]

/** The `thinking.type` a model takes to do no up-front thinking. */
export enum ThinkingOff {
  Disabled = 'disabled',
  /** Claude Sonnet 5.5: no extended thinking, only the short notes between tool calls. */
  BetweenTools = 'between_tools',
}

/** What one Anthropic model family accepts, where the families differ in ways that are a 400. */
export interface AnthropicModelSupport extends EffortSupport {
  /** Model-id prefix; the table below is first match wins, so a longer id comes first. */
  prefix: string
  /**
   * The `thinking.type` that turns up-front thinking off. `null`: the model always thinks and
   * refuses every off switch, so the request sends no `thinking` and effort is the only control.
   * Omitted: `disabled`.
   */
  thinkingOff?: ThinkingOff | null
  /** The highest effort the model accepts together with its off switch. */
  thinkingOffCeiling?: ModelEffort
  /**
   * An absent `thinking` field means adaptive thinking here (the 5 family). On Opus 4.8/4.7 it
   * means none, so they are not marked.
   */
  thinksByDefault?: boolean
  /** `tool_choice` `any` / `tool` is a 400: only `auto` and `none` are accepted. */
  rejectsForcedTool?: boolean
  /** The model's own minimum cacheable prefix, in tokens ({@link MIN_CACHEABLE_TOKENS} when omitted). */
  cacheMinTokens?: number
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

/** The family entry of a model id, or `undefined` for a model the table does not know. */
export const anthropicSupportOf = (model: string | undefined): AnthropicModelSupport | undefined =>
  model != null ? ANTHROPIC_MODEL_SUPPORT.find(entry => model.startsWith(entry.prefix)) : undefined

/**
 * Whether the request has to say, on the wire, that the model must not reason.
 *
 * The adaptive family reasons unless told otherwise: an absent `thinking` parameter means
 * "adaptive", and langchain forwards the parameter only when a caller sets it — so a config
 * that asks for no thinking is only honoured if the plugin sends the model's off switch itself
 * ({@link thinkingOffFor}). Silent reasoning is what the request pays for twice: its tokens bill
 * as output, and the summarised stream delivers them in bursts minutes apart, which an idle
 * deadline reads as a dead connection and retries from scratch. Older models reason only when
 * asked and get nothing.
 *
 * True also for a model that cannot be switched off: the switch is still the request's, never a
 * prompt directive, and such a model is steered by effort alone.
 */
export const suppressesThinking = (config: Pick<ModelConfig, 'model' | 'disableThinking'>): boolean =>
  config.disableThinking === true && rejectsSampling(config.model)

/**
 * The `thinking.type` this config puts on the wire to turn thinking off, or `undefined` when it
 * sends none — because thinking was not turned off, or because the model refuses every off
 * switch.
 */
export const thinkingOffFor = (config: Pick<ModelConfig, 'model' | 'disableThinking'>): ThinkingOff | undefined => {
  if (!suppressesThinking(config)) {
    return undefined
  }
  const off = anthropicSupportOf(config.model)?.thinkingOff

  return off === null ? undefined : off ?? ThinkingOff.Disabled
}

const THINKING_OFF_TYPES = new Set<string>(Object.values(ThinkingOff))

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
  if (wire.thinkingExplicitlySet !== true && anthropicSupportOf(model.modelName ?? model.model)?.thinksByDefault === true) {
    wire.thinking = { type: 'adaptive' }
  }

  return model
}

/** Whether this model id answers a pinned `tool_choice` with a 400. */
export const rejectsForcedTool = (model: string | undefined): boolean =>
  anthropicSupportOf(model)?.rejectsForcedTool === true

const anthropicEffort = (config: Pick<ModelConfig, 'model' | 'disableThinking'>): EffortSupport | undefined => {
  const entry = anthropicSupportOf(config.model)
  if (entry == null) {
    return undefined
  }
  // The ceiling binds only when the off switch is actually sent.
  const ceiling = entry.thinkingOffCeiling
  const levels = ceiling != null && thinkingOffFor(config) != null
    ? entry.levels.filter(level => effortRank(level) <= effortRank(ceiling))
    : entry.levels

  return { levels, default: entry.default }
}

type AnthropicKwargs = Omit<Partial<ChatAnthropic>, 'outputConfig' | 'thinking'> & {
  outputConfig?: { effort?: ModelEffort } & Record<string, unknown>
  thinking?: { type?: string }
}

/** langchain types the wire values as a literal union; `ModelEffort` holds the same strings. */
type WireOutputConfig = NonNullable<ConstructorParameters<typeof ChatAnthropic>[0]>['outputConfig']

/**
 * The SDK's `thinking` union predates `between_tools`; langchain forwards the object as given
 * (`thinking` of an explicitly configured model goes on the wire unchanged).
 */
type WireThinking = NonNullable<ConstructorParameters<typeof ChatAnthropic>[0]>['thinking']

/**
 * The `outputConfig` for one attempt, or `undefined` to leave it as `build` wrote it. The model
 * and thinking switch are read back off the instance, since `refine` has no config — and the
 * thinking switch decides the effort ceiling.
 */
const escalatedOutputConfig = (
  model: ChatAnthropic, kwargs: AnthropicKwargs, steps: number,
): AnthropicKwargs['outputConfig'] => {
  const effort = effortFor(
    anthropicEffort({
      model: model.modelName ?? model.model,
      disableThinking: THINKING_OFF_TYPES.has(kwargs.thinking?.type ?? ''),
    }),
    kwargs.outputConfig?.effort,
    steps,
  )
  return effort != null ? { ...kwargs.outputConfig, effort } : undefined
}

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

type ContentBlock = Record<string, unknown>

const supportsCache = (model: BaseChatModel): boolean =>
  (model as ChatAnthropic).modelName?.startsWith(CACHEABLE_PREFIX) === true

/**
 * Shortest prefix worth a breakpoint, in characters. Anthropic silently declines to
 * create an entry below its own per-model minimum, so a marker there wastes one of the
 * four breakpoints and reports a cache that was never written.
 */
const minCacheableChars = (model: BaseChatModel): number =>
  (readConfig(model).cacheMinTokens
    ?? anthropicSupportOf((model as ChatAnthropic).modelName)?.cacheMinTokens
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
   * does not ({@link rejectsForcedTool}). `ModelConfig.structuredOutput` is ignored.
   */
  structuredMode: () => StructuredMode.Tool,

  /**
   * Anthropic 400s on the OpenAI spelling: "tool_choice: Input tag 'function' … does not
   * match any of the expected tags: 'auto','any','tool','none'". A model that refuses a pinned
   * tool gets `auto` — the only choice left that still offers the tool.
   */
  toolChoice: (toolName: string, config?: Pick<ModelConfig, 'model'>): unknown =>
    rejectsForcedTool(config?.model) ? { type: 'auto' } : { type: 'tool', name: toolName },

  pinsTool: config => !rejectsForcedTool(config.model),

  /**
   * Grammar-constrained arguments stand in for the pin — but only on a schema inside the subset
   * strict tool use compiles; anything else is a 400, which no retry fixes, so it goes unstrict.
   */
  strictTool: (config, schema) => rejectsForcedTool(config.model) && isStrictSchema(schema),

  suppressesThinking: config => suppressesThinking(config),

  effort: config => anthropicEffort(config),

  build: ({ config, secret, callbacks }) => {
    const model = config.model ??= 'claude-haiku-4-5'
    // Claude 4.7+ took the sampling knobs away: not "ignored", a 400. A configured
    // `temperature` on such a model is a preset bug, and dropping it here is the only
    // reading that keeps the call alive — there is nothing to translate it into.
    const sampling = rejectsSampling(model)
      ? {}
      : {
        // Neither knob set → pin temperature to 0 for determinism.
        ...(config.temperature == null && config.topP == null ? { temperature: 0 } : {}),
        ...(config.temperature != null ? { temperature: config.temperature } : {}),
        ...(config.topP != null && config.temperature == null ? { topP: config.topP } : {}),
      }
    // Room for the reasoning these models always do, and for the answer after it.
    const requested = config.maxTokens ?? 4096
    const maxTokens = rejectsSampling(model)
      ? Math.min(Math.max(requested, ADAPTIVE_MIN_MAX_TOKENS), resolveOutputCap(config))
      : requested
    const effort = effortFor(
      anthropicEffort({ model, disableThinking: config.disableThinking }), config.effort, 0,
    )
    const thinkingOff = thinkingOffFor({ model, disableThinking: config.disableThinking })

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
      ...makeClientOptions({ headers: config.headers }),
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
    const maxTokens = escalateMaxTokens(model.maxTokens, attempt, maxOutputCap)
    const kwargs = model.lc_kwargs as AnthropicKwargs
    // Effort is part of the cached prefix, so a climbed retry pays a cache write. A retry is
    // already the rare path, and the answer it buys is the point of retrying.
    const outputConfig = escalatedOutputConfig(model, kwargs, rungAttempt ?? attempt)
    const escalated = outputConfig != null ? { outputConfig } : {}
    // `lc_kwargs` carries whatever `build` put there, so a no-sampling model arrives clean;
    // what has to be suppressed is the escalator's own re-application of a temperature.
    if (rejectsSampling(model.modelName ?? model.model)) {
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
  isFatal: e => e instanceof BadRequestError || isBadRequest(e) ? e as Error : null,
}
