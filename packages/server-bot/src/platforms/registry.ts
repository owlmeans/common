import { BOT_PLATFORMS, BotUnsupportedAction, type BotPlatform } from '@owlmeans/bot'
import type { BotPlatformPlugin } from './types.js'
import type { BotPlatformEntry, BotPlatformRegistry } from './registry/types.js'

/**
 * The registry of a service's plugins. A platform the contract declares but no plugin implements is
 * listed as pending (`implemented: false`): it stays visible to the panels, and the service refuses
 * to save a connection on it. A later plugin for the same platform replaces an earlier one.
 */
export const makeBotPlatformRegistry = (plugins: readonly BotPlatformPlugin[]): BotPlatformRegistry => {
  const byPlatform = new Map<BotPlatform, BotPlatformPlugin>()
  for (const plugin of plugins) {
    byPlatform.set(plugin.platform, plugin)
  }

  const get = (platform: BotPlatform): BotPlatformPlugin | null => byPlatform.get(platform) ?? null

  const require = (platform: BotPlatform): BotPlatformPlugin => {
    const plugin = get(platform)
    if (plugin == null) {
      throw new BotUnsupportedAction(`platform-not-implemented:${platform}`)
    }

    return plugin
  }

  const platforms = (): BotPlatformEntry[] => (Object.keys(BOT_PLATFORMS) as BotPlatform[]).map(platform => ({
    platform, descriptor: BOT_PLATFORMS[platform], implemented: byPlatform.has(platform),
  }))

  return { get, require, platforms, plugins: () => [...byPlatform.values()] }
}
