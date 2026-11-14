import type { LlmSpectator, ModelConfig } from '../types.js'
import type { LlmFetch } from '../plugins/transport/types.js'
import type { LlmPlugin } from '../plugins/types.js'
import type { WebSearchDialect } from './consts.js'

/** How much retrieved page context a provider hands its model before it answers. */
export type WebSearchContextSize = 'low' | 'medium' | 'high' // a closed set of provider literals

/** Approximate user location — localizes results. `country` is ISO 3166-1 alpha-2, `timezone` IANA. */
export interface WebSearchLocation {
  country?: string
  region?: string
  city?: string
  timezone?: string
}

/** Per-config web search settings (`ModelConfig.webSearch`). */
export interface WebSearchConfig {
  /**
   * Force a dialect instead of the plugin's own choice — e.g. `chat` for an OpenAI config on
   * `gpt-5-search-api`, or `responses` / `openrouter` for a compatible host the plugin does not know.
   */
  dialect?: WebSearchDialect | string
  /** Anthropic tool version (`web_search_20250305` by default). */
  tool?: string
  /** OpenRouter search engine (`auto`, `native`, `exa`, …). */
  engine?: string
  /**
   * Deadline of one attempt in ms when the call names none — for a dialect whose answer takes longer
   * than {@link WEB_SEARCH_TIMEOUT_MS} by nature (a delegated performer's own search). Absent → the default.
   */
  timeout?: number
}

export interface WebSearchOptions {
  /** Upper bound on searches the model may run for this answer. */
  maxUses?: number
  /** Results per search, where the dialect takes it (OpenRouter). */
  maxResults?: number
  contextSize?: WebSearchContextSize
  /** Only these domains (no scheme). Cannot be combined with {@link blockedDomains}. */
  allowedDomains?: string[]
  /** Never these domains (no scheme). */
  blockedDomains?: string[]
  location?: WebSearchLocation
  /** Instruction the answer is written under — the system prompt of the search call. */
  instructions?: string
  /** Output budget of the answer. */
  maxTokens?: number
  signal?: AbortSignal
  /** Deadline of one attempt in ms (`ModelConfig.webSearch.timeout`, else {@link WEB_SEARCH_TIMEOUT_MS}). */
  timeout?: number
  /** Attempts, the first included ({@link WEB_SEARCH_RETRIES} by default). */
  retries?: number
  /** Spectator label of the call. */
  action?: string
  /** Observability sink — the search is logged like a model call. */
  spectator?: LlmSpectator
}

export interface WebSearchCitation {
  url: string
  title?: string
  /** The cited passage, as the provider reported it. */
  quote?: string
  /** Character range of the cited span in {@link WebSearchResult.text}, when the provider gave one. */
  start?: number
  end?: number
}

export interface WebSearchSource {
  url: string
  title?: string
  /** How old the page is, as the provider reported it (Anthropic `page_age`, a date). */
  age?: string
  /** A retrieved excerpt. */
  snippet?: string
}

export interface WebSearchUsage {
  input?: number
  output?: number
}

/** A search the provider reported as failed inside an otherwise successful answer. */
export interface WebSearchIssue {
  code: string
  message?: string
}

export interface WebSearchResult {
  /** The answer, Markdown. */
  text: string
  citations: WebSearchCitation[]
  /** Every page consulted, deduplicated by URL — cited ones included. */
  sources: WebSearchSource[]
  queries: string[]
  /** Billable searches the provider reported (0 when it reports none). */
  searches: number
  usage: WebSearchUsage
  provider: string
  model: string
  dialect: string
  errors: WebSearchIssue[]
}

/**
 * One provider-hosted web search, bound to a resolved model config. It goes to the provider
 * directly — never through `llmTransportRegistry`, so an installed LLM proxy cannot reroute it.
 */
export interface WebSearch {
  readonly provider: string
  readonly model: string | undefined
  /** Ask a question the model answers from a live web search. */
  search: (input: string, options?: WebSearchOptions) => Promise<WebSearchResult>
}

/** What {@link makeWebSearch} is bound to. */
export interface WebSearchBinding {
  alias: string
  /** The fully resolved config, secret stripped. */
  config: ModelConfig
  secret: string
  plugin: LlmPlugin
  /** Replaces `globalThis.fetch`, which is otherwise read at call time. */
  fetch?: LlmFetch
}

/** One answer segment a plugin returns; citation offsets are relative to its own text. */
export interface LlmSearchPart {
  text: string
  citations: WebSearchCitation[]
}

/** What `LlmPlugin.search` is called with — one attempt. */
export interface LlmSearchParams {
  alias: string
  config: ModelConfig
  secret: string
  input: string
  options: WebSearchOptions
  fetch: LlmFetch
  signal: AbortSignal
  /** 0-based attempt; a plugin doubles an exhausted output budget with it. */
  attempt: number
}

/** What a plugin's dialect read off the provider's answer. */
export interface LlmSearchOutput {
  dialect: string
  model: string
  parts: LlmSearchPart[]
  /** Joins {@link parts} — `''` when the provider splits one answer at citation boundaries. */
  separator?: string
  sources: WebSearchSource[]
  queries: string[]
  searches?: number
  usage?: WebSearchUsage
  errors?: WebSearchIssue[]
  /** The answer was cut by the output budget. */
  incomplete?: boolean
}

/** A provider's search dialect: one attempt, read into parts. What `LlmPlugin.search` is. */
export interface LlmSearchDialect {
  (params: LlmSearchParams): Promise<LlmSearchOutput>
}
