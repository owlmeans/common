import type { BotSyncListener, BotSyncTopic, BotSyncUtils } from './sync/types.js'

export const createBotSyncUtils = (): BotSyncUtils => {
  const listeners = new Map<string, Set<BotSyncListener>>()

  const keyOf = (alias: string, topic: BotSyncTopic): string => `${alias}\u0000${topic}`

  const subscribe = (alias: string, topic: BotSyncTopic, listener: BotSyncListener): (() => void) => {
    const key = keyOf(alias, topic)
    const set = listeners.get(key) ?? new Set<BotSyncListener>()
    listeners.set(key, set)
    set.add(listener)

    return () => {
      set.delete(listener)
      if (set.size === 0) listeners.delete(key)
    }
  }

  const publish = (alias: string, topic: BotSyncTopic, origin?: BotSyncListener): void => {
    for (const listener of [...listeners.get(keyOf(alias, topic)) ?? []]) {
      if (listener !== origin) listener()
    }
  }

  return { subscribe, publish }
}

export const botSyncUtils = createBotSyncUtils()
