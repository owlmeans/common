import type { UsageMetadata } from '@langchain/core/messages'
import type { CacheUsage } from '@owlmeans/llm-common'

/** LangChain normalizes every provider's cache accounting into these two fields. */
interface InputTokenDetails {
  cache_read?: number
  cache_creation?: number
}

/**
 * Prompt-cache accounting for one completion.
 *
 * This is the only honest answer to "is caching actually working". A composed prefix can
 * look perfectly stable and still miss on every call — a stray timestamp, a set iterated
 * in a different order, a tool list rebuilt per request. If `read` stays at zero across
 * repeated calls that share a prefix, something is invalidating it; diff the rendered
 * blocks between two calls to find out what.
 */
export const readCacheUsage = (message: { usage_metadata?: UsageMetadata }): CacheUsage => {
  const usage = message.usage_metadata
  const details = usage?.input_token_details as InputTokenDetails | undefined

  return {
    read: details?.cache_read ?? 0,
    creation: details?.cache_creation ?? 0,
    input: usage?.input_tokens ?? 0,
    output: usage?.output_tokens ?? 0,
  }
}

/** `true` when the provider reported any cache activity at all. */
export const hasCacheActivity = (usage: CacheUsage): boolean =>
  usage.read > 0 || usage.creation > 0
