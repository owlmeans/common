import type { UsageMetadata } from '@langchain/core/messages'
import type { CacheUsage } from '@owlmeans/llm-common'
import type { InputTokenDetails, ProviderUsage } from './types.local.js'
import type { CacheAccounted, CacheHelper } from './cache/types.js'

export const createCacheHelper = (): CacheHelper => {
  const readCacheUsage = (message: { usage_metadata?: UsageMetadata }): CacheUsage => {
    const usage = message.usage_metadata
    const details = usage?.input_token_details as InputTokenDetails | undefined
    const long = details?.cache_creation_1h ?? 0

    return {
      read: details?.cache_read ?? 0,
      creation: details?.cache_creation ?? 0,
      ...(long > 0 ? { creationLong: long } : {}),
      input: usage?.input_tokens ?? 0,
      output: usage?.output_tokens ?? 0,
    }
  }

  const hasCacheActivity = (usage: CacheUsage): boolean =>
    usage.read > 0 || usage.creation > 0

  const withCacheTiers = <T extends CacheAccounted>(message: T): T => {
    const usage = message.response_metadata?.usage as ProviderUsage | undefined
    const long = usage?.cache_creation?.ephemeral_1h_input_tokens
    if (typeof long === 'number' && long > 0 && message.usage_metadata != null) {
      const details: InputTokenDetails = { ...message.usage_metadata.input_token_details, cache_creation_1h: long }
      message.usage_metadata = { ...message.usage_metadata, input_token_details: details as UsageMetadata['input_token_details'] }
    }

    return message
  }

  return { readCacheUsage, hasCacheActivity, withCacheTiers }
}

export const cacheHelper = createCacheHelper()

/** @deprecated compat:factory-refactor — use `cacheHelper.readCacheUsage(…)` */
export const readCacheUsage = (message: { usage_metadata?: UsageMetadata }): CacheUsage =>
  cacheHelper.readCacheUsage(message)

/** @deprecated compat:factory-refactor — use `cacheHelper.hasCacheActivity(…)` */
export const hasCacheActivity = (usage: CacheUsage): boolean => cacheHelper.hasCacheActivity(usage)
