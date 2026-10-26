/**
 * LangChain normalizes every provider's cache accounting into `cache_read` and `cache_creation`;
 * `cache_creation_1h` is this package's own key for the 1-hour part of `cache_creation`, set by
 * `cacheHelper.withCacheTiers` (chunk concatenation drops any key langchain does not know).
 */
export interface InputTokenDetails {
  cache_read?: number
  cache_creation?: number
  cache_creation_1h?: number
}

/** Anthropic's own usage block, as langchain keeps it on `response_metadata.usage`. */
export interface ProviderUsage {
  cache_creation?: { ephemeral_1h_input_tokens?: unknown }
}
