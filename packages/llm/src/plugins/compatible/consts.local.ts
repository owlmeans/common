/** Hosts (and their subdomains) answered with the OpenRouter server tool. */
export const OPENROUTER_SEARCH_HOSTS: readonly string[] = ['openrouter.ai']

/** Hosts whose Chat Completions search models take `web_search_options`. */
export const CHAT_SEARCH_HOSTS: readonly string[] = ['api.openai.com', 'api.perplexity.ai']

/** Hosts that read `max_completion_tokens` rather than `max_tokens`. */
export const COMPLETION_TOKENS_HOSTS: readonly string[] = ['api.openai.com']

/** OpenRouter's search tool — run on its side, so the answer comes back in one response. */
export const OPENROUTER_SEARCH_TOOL = 'openrouter:web_search'
