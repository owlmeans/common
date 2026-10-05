import type { UsageMetadata } from '@langchain/core/messages'
import type { CacheUsage } from '@owlmeans/llm-common'

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
}
