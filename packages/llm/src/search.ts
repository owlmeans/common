import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { LlmMissconfiguredError, LlmSearchError, LlmSearchUnsupportedError } from './errors.js'
import { retryHelper } from './helpers/retry.js'
import { spectate } from './helpers/spectate.js'
import type { LlmFetch } from './plugins/transport/types.js'
import {
  WEB_SEARCH_CALL_TYPE, WEB_SEARCH_RETRIES, WEB_SEARCH_TIMEOUT_MS,
} from './search/consts.js'
import type {
  LlmSearchOutput, WebSearch, WebSearchBinding, WebSearchOptions, WebSearchResult,
} from './search/types.js'
import { searchUtils } from './utils/search.js'

/** Statuses no retry changes: auth, payment, a missing model, an unprocessable request. */
const FATAL_STATUSES = new Set([400, 401, 402, 403, 404, 422])

/** OpenAI's 429 for an exhausted balance — not a rate limit, waiting does not help. */
const QUOTA_CODES = new Set(['insufficient_quota'])

/**
 * A provider-hosted web search bound to one resolved model config.
 *
 * The request goes out through `binding.fetch`, or `globalThis.fetch` read at call time — never
 * through `llmTransportRegistry`, and never through an SDK client — so an installed LLM proxy
 * (which attaches to that registry) cannot reroute or rewrite it. The provider's own dialect is
 * the plugin's `search` member; this object owns what every dialect shares: option validation,
 * the per-attempt deadline, retry with backoff, joining the parts into one answer, and the
 * spectator entry.
 */
export const makeWebSearch = (binding: WebSearchBinding): WebSearch => {
  const { alias, config, secret, plugin } = binding
  const provider = config.provider ?? plugin.type
  const fetch: LlmFetch = binding.fetch ?? ((input, init) => globalThis.fetch(input, init))

  const validate = (input: string, options: WebSearchOptions): void => {
    if (input.trim().length === 0) {
      throw new LlmSearchUnsupportedError('empty-query')
    }
    if (options.allowedDomains != null && options.blockedDomains != null) {
      throw new LlmSearchUnsupportedError('allowed-and-blocked-domains')
    }
    if (plugin.search == null) {
      throw new LlmSearchUnsupportedError(`provider:${provider}`)
    }
  }

  /** What no retry can fix — aborted by the caller, refused by the provider, out of money. */
  const fatalOf = (signal: AbortSignal | undefined) => (e: unknown): Error | null => {
    if (signal?.aborted === true) return e as Error
    if (e instanceof LlmMissconfiguredError) return e
    if (e instanceof LlmSearchError) {
      if (e.status != null && FATAL_STATUSES.has(e.status)) return e
      if (e.code != null && QUOTA_CODES.has(e.code)) return e
    }
    return null
  }

  const sleep = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })

  /**
   * The answer as the caller asked for it. A domain bound is enforced here as well, because the
   * providers' own filters leak — an Anthropic search under `allowed_domains` has returned results
   * from other hosts — and a caller restricting research to trusted sources must get only those:
   * a source or citation outside the bound is dropped and reported as an `out-of-domain` issue.
   */
  const normalize = (output: LlmSearchOutput, options: WebSearchOptions): WebSearchResult => {
    const { text, citations } = searchUtils.join(output)
    const bounded = options.allowedDomains != null || options.blockedDomains != null
    const inBounds = (url: string): boolean =>
      !bounded || searchUtils.inBounds(url, options.allowedDomains, options.blockedDomains)
    const sources = searchUtils.mergeSources(output.sources, citations)
    const leaked = searchUtils.unique(sources.filter(source => !inBounds(source.url)).map(source => source.url))

    return {
      text,
      citations: citations.filter(citation => inBounds(citation.url)),
      sources: sources.filter(source => inBounds(source.url)),
      queries: searchUtils.unique(output.queries),
      searches: output.searches ?? 0,
      usage: output.usage ?? {},
      provider,
      model: output.model,
      dialect: output.dialect,
      errors: [...output.errors ?? [], ...leaked.map(url => ({ code: 'out-of-domain', message: url }))],
    }
  }

  const record = async (input: string, options: WebSearchOptions, result: WebSearchResult, attempt: number, startedAt: number) => {
    if (options.spectator == null) return
    const message = new AIMessage({
      content: result.text,
      response_metadata: { citations: result.citations, sources: result.sources, queries: result.queries, searches: result.searches },
      usage_metadata: {
        input_tokens: result.usage.input ?? 0,
        output_tokens: result.usage.output ?? 0,
        total_tokens: (result.usage.input ?? 0) + (result.usage.output ?? 0),
      },
    })
    const prompt = [
      ...(options.instructions != null ? [new SystemMessage(options.instructions)] : []),
      new HumanMessage(input),
    ]
    await spectate(options.spectator, WEB_SEARCH_CALL_TYPE)(
      prompt, message, options.action ?? WEB_SEARCH_CALL_TYPE, attempt, startedAt, result.model,
    )
  }

  const search: WebSearch['search'] = async (input, options = {}) => {
    validate(input, options)
    const startedAt = Date.now()
    let retryAfter: number | undefined
    let attempts = 0
    const fatal = fatalOf(options.signal)

    const result = await retryHelper.withRetry({
      retries: Math.max(1, options.retries ?? WEB_SEARCH_RETRIES),
      fatal: e => {
        retryAfter = e instanceof LlmSearchError ? e.retryAfter : undefined
        return fatal(e)
      },
    }, async attempt => {
      attempts = attempt
      if (attempt > 0) {
        await sleep(searchUtils.backoff(attempt, retryAfter), options.signal)
      }
      const deadline = AbortSignal.timeout(options.timeout ?? config.webSearch?.timeout ?? WEB_SEARCH_TIMEOUT_MS)
      const signal = options.signal != null ? AbortSignal.any([options.signal, deadline]) : deadline
      const output = await plugin.search!({ alias, config, secret, input, options, fetch, signal, attempt })
      const normalized = normalize(output, options)
      if (normalized.text.length === 0) {
        // An answer cut by its budget is retried with a doubled one (the plugin reads `attempt`).
        const error = new LlmSearchError(output.incomplete === true ? 'incomplete' : 'empty-answer')
        error.provider = provider
        error.code = normalized.errors[0]?.code
        throw error
      }

      return normalized
    })
    await record(input, options, result, attempts, startedAt)

    return result
  }

  return { provider, model: config.model, search }
}
