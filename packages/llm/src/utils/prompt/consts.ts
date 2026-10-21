/** Keys a content block carries a cache marker under — Anthropic's and OpenAI's. */
export const CACHE_MARKER_KEYS: readonly string[] = Object.freeze(['cache_control', 'prompt_cache_breakpoint'])

/** Final-message roles the tail is appended to in place; after any other a user message carries it. */
export const TAIL_TAKERS: readonly string[] = Object.freeze(['user'])
