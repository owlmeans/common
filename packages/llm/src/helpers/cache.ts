import type { UsageMetadata } from '@langchain/core/messages'
import type { CacheUsage } from '@owlmeans/llm-common'
import type { InputTokenDetails } from './types.local.js'
import type { CacheHelper } from './cache/types.js'

export const createCacheHelper = (): CacheHelper => {
  const readCacheUsage = (message: { usage_metadata?: UsageMetadata }): CacheUsage => {
    const usage = message.usage_metadata
    const details = usage?.input_token_details as InputTokenDetails | undefined

    return {
      read: details?.cache_read ?? 0,
      creation: details?.cache_creation ?? 0,
      input: usage?.input_tokens ?? 0,
      output: usage?.output_tokens ?? 0,
    }
  }

  const hasCacheActivity = (usage: CacheUsage): boolean =>
    usage.read > 0 || usage.creation > 0

  return { readCacheUsage, hasCacheActivity }
}

export const cacheHelper = createCacheHelper()

/** @deprecated compat:factory-refactor — use `cacheHelper.readCacheUsage(…)` */
export const readCacheUsage = (message: { usage_metadata?: UsageMetadata }): CacheUsage =>
  cacheHelper.readCacheUsage(message)

/** @deprecated compat:factory-refactor — use `cacheHelper.hasCacheActivity(…)` */
export const hasCacheActivity = (usage: CacheUsage): boolean => cacheHelper.hasCacheActivity(usage)
