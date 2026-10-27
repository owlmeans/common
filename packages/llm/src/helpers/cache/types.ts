import type { UsageMetadata } from '@langchain/core/messages'
import type { CacheUsage } from '@owlmeans/llm-common'

/** A completion as far as cache accounting reads it. */
export interface CacheAccounted {
  usage_metadata?: UsageMetadata
  response_metadata?: Record<string, unknown>
}

/** Prompt-cache accounting. */
export interface CacheHelper {
  /**
   * Prompt-cache accounting for one completion.
   *
   * This is the only honest answer to "is caching actually working". A composed prefix can
   * look perfectly stable and still miss on every call — a stray timestamp, a set iterated
   * in a different order, a tool list rebuilt per request. If `read` stays at zero across
   * repeated calls that share a prefix, something is invalidating it; diff the rendered
   * blocks between two calls to find out what.
   */
  readCacheUsage: (message: { usage_metadata?: UsageMetadata }) => CacheUsage
  /** `true` when the provider reported any cache activity at all. */
  hasCacheActivity: (usage: CacheUsage) => boolean
  /**
   * Carry the 1-hour part of a cache write onto the usage, as `input_token_details.cache_creation_1h`
   * — set only when the provider reported a non-zero one. Anthropic reports the split in
   * `response_metadata.usage.cache_creation`, which survives chunk concatenation; the usage's own
   * token details do not keep a key langchain does not know. Call it on the ACCUMULATED message:
   * it sets a new usage object on that message and returns it.
   */
  withCacheTiers: <T extends CacheAccounted>(message: T) => T
}
