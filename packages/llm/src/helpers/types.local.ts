/** LangChain normalizes every provider's cache accounting into these two fields. */
export interface InputTokenDetails {
  cache_read?: number
  cache_creation?: number
}
