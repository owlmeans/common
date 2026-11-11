import type { ModelConfig } from '../../types.js'
import type { EffortSupport } from '../types.js'
import type {
  LlmSearchDialect, LlmSearchPart, WebSearchIssue, WebSearchSource,
} from '../../search/types.js'
import { WebSearchDialect, WEB_SEARCH_MAX_TOKENS } from '../../search/consts.js'
import { ADAPTIVE_MIN_MAX_TOKENS } from '../consts.js'
import { configUtils } from '../../utils/config.js'
import { effortUtils } from '../../utils/effort.js'
import { searchUtils } from '../../utils/search.js'
import { pluginUtils } from '../utils.js'
import { anthropicSupportHelper } from './support.js'
import {
  ANTHROPIC_API_VERSION, ANTHROPIC_DEFAULT_MODEL, ANTHROPIC_MESSAGES_URL, ANTHROPIC_SEARCH_CONTINUATIONS,
  ANTHROPIC_SEARCH_DIRECTIVE, ANTHROPIC_SEARCH_TOOL,
} from './consts.local.js'
import type { AnthropicSearchBlock, AnthropicSearchResponse } from './search/types.local.js'

/**
 * The Messages-API search dialect. The request is shaped like the chat client's for the same
 * model — the same thinking switch, effort and adaptive output floor, and no sampling knob, which
 * the newest families answer with a 400 — and it goes to the official endpoint with `x-api-key`.
 *
 * `effortOf` is the plugin's own effort table, handed in so this module does not import the
 * plugin back.
 */
export const createAnthropicSearch = (
  effortOf: (config: Pick<ModelConfig, 'model' | 'disableThinking'>) => EffortSupport | undefined,
): LlmSearchDialect => async ({ config, secret, input, options, fetch, signal, attempt }) => {
  const model = config.model ?? ANTHROPIC_DEFAULT_MODEL
  const tool = config.webSearch?.tool ?? ANTHROPIC_SEARCH_TOOL
  const cap = configUtils.resolveOutputCap(config)
  const requested = pluginUtils.escalateMaxTokens(options.maxTokens ?? config.maxTokens ?? WEB_SEARCH_MAX_TOKENS, attempt, cap)
  const maxTokens = anthropicSupportHelper.rejectsSampling(model)
    ? Math.min(Math.max(requested, ADAPTIVE_MIN_MAX_TOKENS), cap)
    : requested
  const thinkingOff = anthropicSupportHelper.thinkingOffFor({ model, disableThinking: config.disableThinking })
  const effort = effortUtils.effortFor(effortOf({ model, disableThinking: config.disableThinking }), config.effort, 0)

  const toolDefinition: Record<string, unknown> = {
    type: tool,
    name: 'web_search',
    ...(options.maxUses != null ? { max_uses: options.maxUses } : {}),
    ...(options.allowedDomains != null ? { allowed_domains: options.allowedDomains } : {}),
    ...(options.blockedDomains != null ? { blocked_domains: options.blockedDomains } : {}),
    ...(options.location != null ? { user_location: { type: 'approximate', ...options.location } } : {}),
    // From 20260209 on the tool defaults to being called from code execution (dynamic
    // filtering); a plain search is a direct call, and models without programmatic tool
    // calling refuse anything else.
    ...(tool > ANTHROPIC_SEARCH_TOOL ? { allowed_callers: ['direct'] } : {}),
  }
  // The tool is model-driven: a question the model thinks it knows is answered unsearched. Pinned
  // where the model accepts a pinned tool; told, where a pin is a 400.
  const pinned = !anthropicSupportHelper.rejectsForcedTool(model)
  const system = pinned
    ? options.instructions
    : [ANTHROPIC_SEARCH_DIRECTIVE, options.instructions].filter(text => text != null).join('\n\n')
  const headers = { 'x-api-key': secret, 'anthropic-version': ANTHROPIC_API_VERSION, ...config.headers }
  const question = { role: 'user', content: input }

  const blocks: AnthropicSearchBlock[] = []
  let response: AnthropicSearchResponse = {}
  let input_tokens = 0
  let output_tokens = 0
  let searches = 0
  for (let turn = 0; turn <= ANTHROPIC_SEARCH_CONTINUATIONS; ++turn) {
    response = await searchUtils.postJson({
      fetch, url: ANTHROPIC_MESSAGES_URL, headers, signal, provider: 'anthropic', secret,
      body: {
        model,
        max_tokens: maxTokens,
        ...(system != null ? { system } : {}),
        // A paused turn resumes from the assistant content as it was received, unchanged —
        // encrypted search results included.
        messages: blocks.length > 0 ? [question, { role: 'assistant', content: blocks }] : [question],
        tools: [toolDefinition],
        // A resumed turn is past its first search: the pin would force yet another one.
        ...(pinned && blocks.length === 0 ? { tool_choice: { type: 'tool', name: 'web_search' } } : {}),
        ...(thinkingOff != null ? { thinking: { type: thinkingOff } } : {}),
        ...(effort != null ? { output_config: { effort } } : {}),
      },
    }) as AnthropicSearchResponse
    blocks.push(...response.content ?? [])
    const usage = response.usage ?? {}
    input_tokens += (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
    output_tokens += usage.output_tokens ?? 0
    searches += usage.server_tool_use?.web_search_requests ?? 0
    if (response.stop_reason !== 'pause_turn') {
      break
    }
  }

  const queries: string[] = []
  const sources: WebSearchSource[] = []
  const errors: WebSearchIssue[] = []
  for (const block of blocks) {
    if (block.type === 'server_tool_use' && block.name === 'web_search' && typeof block.input?.query === 'string') {
      queries.push(block.input.query)
    }
    if (block.type !== 'web_search_tool_result') continue
    if (Array.isArray(block.content)) {
      for (const result of block.content) {
        if (typeof result.url !== 'string') continue
        sources.push({
          url: result.url,
          ...(result.title != null ? { title: result.title } : {}),
          ...(result.page_age != null ? { age: result.page_age } : {}),
        })
      }
    } else if (block.content?.error_code != null) {
      errors.push({ code: block.content.error_code })
    }
  }

  // "Let me search for that." before the first result is narration, not answer — dropped when
  // an answer follows the results.
  const firstResult = blocks.findIndex(block => block.type === 'web_search_tool_result')
  const answered = firstResult >= 0 && blocks.slice(firstResult).some(block => block.type === 'text')
  const parts: LlmSearchPart[] = blocks
    .filter((block, index) => block.type === 'text' && typeof block.text === 'string' && (!answered || index > firstResult))
    .map(block => {
      const text = block.text!
      return {
        text,
        citations: (block.citations ?? [])
          .filter(citation => typeof citation.url === 'string')
          .map(citation => ({
            url: citation.url!,
            ...(citation.title != null ? { title: citation.title } : {}),
            ...(citation.cited_text != null ? { quote: citation.cited_text } : {}),
            // A cited block IS the cited span: Anthropic splits text at citation boundaries.
            ...searchUtils.range(0, text.length),
          })),
      }
    })

  return {
    dialect: WebSearchDialect.Anthropic,
    model: response.model ?? model,
    parts,
    separator: '',
    sources,
    queries,
    searches,
    usage: { input: input_tokens, output: output_tokens },
    errors,
    incomplete: response.stop_reason === 'max_tokens',
  }
}
