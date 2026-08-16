import { ChatAnthropic } from '@langchain/anthropic'
import { BadRequestError } from '@anthropic-ai/sdk'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { MessageContent, MessageFieldWithRole } from '@langchain/core/messages'
import { ModelProvider, PromptBlock, StructuredMode } from '@owlmeans/llm-common'
import type { CacheTtl } from '@owlmeans/llm-common'
import type { LlmPlugin } from './types.js'
import { CHARS_PER_TOKEN, MAX_CACHE_BREAKPOINTS, MIN_CACHEABLE_TOKENS } from '../consts.js'
import { readConfig } from '../utils/config.js'
import { escalateMaxTokens, isBadRequest, makeClientOptions } from './utils.js'

/** Model-name prefix that supports prompt caching through `cache_control` markers. */
const CACHEABLE_PREFIX = 'claude-'

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
  (readConfig(model).cacheMinTokens ?? MIN_CACHEABLE_TOKENS) * CHARS_PER_TOKEN

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
   * Anthropic has no `response_format: json_schema` mode, so structured output is
   * always the forced-tool-call hack. `ModelConfig.structuredOutput` is ignored.
   */
  structuredMode: () => StructuredMode.Tool,

  /**
   * Anthropic 400s on the OpenAI spelling: "tool_choice: Input tag 'function' … does not
   * match any of the expected tags: 'auto','any','tool','none'".
   */
  toolChoice: (toolName: string): unknown => ({ type: 'tool', name: toolName }),

  build: ({ config, secret, callbacks }) => {
    const model = config.model ??= 'claude-haiku-4-5-20251001'
    const cfg = {
      model,
      apiKey: secret,
      // Neither knob set → pin temperature to 0 for determinism.
      ...(config.temperature == null && config.topP == null ? { temperature: 0 } : {}),
      maxTokens: config.maxTokens ?? 4096,
      maxRetries: 5,
      metadata: { config },
      callbacks,
      ...(config.temperature != null ? { temperature: config.temperature } : {}),
      ...(config.topP != null && config.temperature == null ? { topP: config.topP } : {}),
      ...makeClientOptions({ headers: config.headers }),
    }
    // Anthropic rejects temperature and top_p together.
    if (cfg.temperature != null && cfg.topP != null) {
      delete cfg.topP
    }

    return new ChatAnthropic(cfg)
  },

  refine: ({ base, attempt, temperature, maxOutputCap }): BaseChatModel => {
    const model = base as ChatAnthropic
    const currentTemperature = temperature ?? model.temperature ?? 0
    const maxTokens = escalateMaxTokens(model.maxTokens, attempt, maxOutputCap)
    const cfg: Partial<ChatAnthropic> = {
      ...(model.lc_kwargs as Partial<ChatAnthropic>), temperature: currentTemperature, maxTokens,
    }
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
