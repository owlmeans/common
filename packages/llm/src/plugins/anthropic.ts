import { ChatAnthropic } from '@langchain/anthropic'
import { BadRequestError } from '@anthropic-ai/sdk'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ModelProvider, StructuredMode } from '@owlmeans/llm-common'
import type { LlmPlugin } from './types.js'
import { MAX_CACHE_BREAKPOINTS } from '../consts.js'
import { escalateMaxTokens, makeClientOptions } from './utils.js'

/** Model-name prefix that supports prompt caching through `cache_control` markers. */
const CACHEABLE_PREFIX = 'claude-'

export const ANTHROPIC_FAMILY = 'anthropic'

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
   * Mark the leading messages with an ephemeral `cache_control` breakpoint. Anthropic
   * allows at most {@link MAX_CACHE_BREAKPOINTS}; string content is lifted into a
   * single text block so the marker has somewhere to live.
   */
  patchCache: (msgs, { model, useCache, cacheMax }) => {
    if (!useCache || !(model as ChatAnthropic).modelName?.startsWith(CACHEABLE_PREFIX)) return false
    const max = Math.min(cacheMax, MAX_CACHE_BREAKPOINTS)
    let i = 0
    for (const msg of msgs) {
      msg.content = typeof msg.content === 'string' ? [{
        type: 'text',
        text: msg.content,
        cache_control: { type: 'ephemeral' },
      }] : msg.content
      if (++i > max - 1) break
    }
    return true
  },

  /**
   * A malformed request (bad schema, unsupported parameter, oversized `max_tokens`)
   * cannot be fixed by retrying — surface it immediately instead of burning the budget.
   */
  isFatal: e => e instanceof BadRequestError ? e : null,
}
