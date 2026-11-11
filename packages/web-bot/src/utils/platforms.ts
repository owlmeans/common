import type { BotPlatformDescriptor } from '@owlmeans/bot'
import type { BotPlatformCacheUtils } from './platforms/types.js'

export const createBotPlatformCacheUtils = (): BotPlatformCacheUtils => {
  const settled = new Map<string, BotPlatformDescriptor[]>()
  const pending = new Map<string, Promise<BotPlatformDescriptor[]>>()

  const peek: BotPlatformCacheUtils['peek'] = alias => settled.get(alias)

  const read: BotPlatformCacheUtils['read'] = async (alias, source) => {
    const known = settled.get(alias)
    if (known != null) return known
    let flight = pending.get(alias)
    if (flight == null) {
      flight = source.load().then(
        items => {
          settled.set(alias, items)
          pending.delete(alias)
          return items
        },
        error => {
          pending.delete(alias)
          throw error
        }
      )
      pending.set(alias, flight)
    }

    return await flight
  }

  const forget: BotPlatformCacheUtils['forget'] = alias => {
    settled.delete(alias)
    pending.delete(alias)
  }

  return { peek, read, forget }
}

export const botPlatformCacheUtils = createBotPlatformCacheUtils()
