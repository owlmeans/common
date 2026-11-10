import type { LlmSearchDialect, LlmSearchParams } from '../../search/types.js'
import { WebSearchDialect } from '../../search/consts.js'
import { LlmSearchUnsupportedError } from '../../errors.js'
import { searchUtils } from '../../utils/search.js'
import { openAiSearchHelper } from '../openai/search.js'
import {
  CHAT_SEARCH_HOSTS, COMPLETION_TOKENS_HOSTS, OPENROUTER_SEARCH_HOSTS, OPENROUTER_SEARCH_TOOL,
} from './consts.local.js'

/** The `openrouter:web_search` tool parameters a call asks for; the engine comes from the config. */
const openRouterParameters = ({ config, options }: LlmSearchParams): Record<string, unknown> => ({
  ...(config.webSearch?.engine != null ? { engine: config.webSearch.engine } : {}),
  ...(options.maxResults != null ? { max_results: options.maxResults } : {}),
  ...(options.maxUses != null ? { max_uses: options.maxUses } : {}),
  ...(options.contextSize != null ? { search_context_size: options.contextSize } : {}),
  ...(options.allowedDomains != null ? { allowed_domains: options.allowedDomains } : {}),
  ...(options.blockedDomains != null ? { excluded_domains: options.blockedDomains } : {}),
  ...(options.location != null ? { user_location: { type: 'approximate', ...options.location } } : {}),
})

/**
 * The compatible plugin's search: the dialect follows the host of `baseUrl`, because an
 * OpenAI-compatible endpoint that does not know a search field either rejects it or — worse —
 * ignores it and answers unsearched. A host not listed needs `ModelConfig.webSearch.dialect`.
 *
 * The request reuses nothing of the chat body: no sampling knobs and no
 * `provider.require_parameters` (which would exclude every route serving the tool); the
 * config's `reasoning` is forwarded to OpenRouter only.
 */
export const createCompatibleSearch = (): LlmSearchDialect => async params => {
  const base = params.config.baseUrl?.replace(/\/+$/, '')
  const host = searchUtils.hostOf(base)
  if (base == null || host == null) {
    throw new LlmSearchUnsupportedError('compatible:no-base-url')
  }
  const listed = (hosts: readonly string[]): boolean => hosts.some(domain => searchUtils.matchesHost(host, domain))
  const dialect = params.config.webSearch?.dialect
    ?? (listed(OPENROUTER_SEARCH_HOSTS) ? WebSearchDialect.OpenRouter : listed(CHAT_SEARCH_HOSTS) ? WebSearchDialect.Chat : undefined)

  switch (dialect) {
    case WebSearchDialect.OpenRouter:
      return openAiSearchHelper.chat(params, {
        url: `${base}/chat/completions`,
        provider: 'compatible',
        dialect,
        body: {
          tools: [{ type: OPENROUTER_SEARCH_TOOL, parameters: openRouterParameters(params) }],
          ...(params.config.reasoning != null ? { reasoning: params.config.reasoning } : {}),
        },
        tokenParam: 'max_tokens',
        // OpenRouter holds credit against the requested budget; unbounded, a small balance
        // answers 402 before the model runs.
        alwaysBudget: true,
      })
    case WebSearchDialect.Chat:
      return openAiSearchHelper.chat(params, {
        url: `${base}/chat/completions`,
        provider: 'compatible',
        dialect,
        body: openAiSearchHelper.webSearchOptions(params.options),
        tokenParam: listed(COMPLETION_TOKENS_HOSTS) ? 'max_completion_tokens' : 'max_tokens',
      })
    case WebSearchDialect.Responses:
      return openAiSearchHelper.responses(params, { url: `${base}/responses`, provider: 'compatible' })
    default:
      throw new LlmSearchUnsupportedError(`compatible:${dialect ?? host}`)
  }
}

export const compatibleSearch = createCompatibleSearch()
