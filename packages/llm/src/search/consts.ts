/**
 * The wire dialect one web search is asked in. Chosen by the provider plugin — an OpenAI
 * config asks the Responses API, an Anthropic one the Messages API, a compatible one by the
 * host of its `baseUrl` — and overridable per config through `ModelConfig.webSearch.dialect`.
 */
export enum WebSearchDialect {
  /** Anthropic Messages API with the `web_search_*` server tool. */
  Anthropic = 'anthropic',
  /** OpenAI Responses API with the `web_search` tool (also any endpoint that mirrors it). */
  Responses = 'responses',
  /** Chat Completions with `web_search_options` — search models that always search (`gpt-5-search-api`). */
  Chat = 'chat',
  /** OpenRouter Chat Completions with the `openrouter:web_search` server tool. */
  OpenRouter = 'openrouter',
}

/** How long one search attempt may take, end to end, before it is aborted. */
export const WEB_SEARCH_TIMEOUT_MS = 5 * 60 * 1000

/** Attempts per search: the first plus one retry of a transient failure. */
export const WEB_SEARCH_RETRIES = 2

/** Output budget of a search answer when neither the call nor the config names one. */
export const WEB_SEARCH_MAX_TOKENS = 8192

/** First backoff before a retried attempt; doubles per attempt. */
export const WEB_SEARCH_BACKOFF_MS = 1000

/** The longest a retry waits, `retry-after` included. */
export const WEB_SEARCH_BACKOFF_CAP_MS = 30_000

/** Spectator call type of a search entry. */
export const WEB_SEARCH_CALL_TYPE = 'web-search'
