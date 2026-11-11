import { BotUnsupportedAction, type BotPlatformDescriptor, type BotPlatformId } from '@owlmeans/bot'
import type { BotPlatformPlugin } from './types.js'
import type { BotPlatformRegistry } from './registry/types.js'

/**
 * The registry of a service's plugins — the ONLY source of the platforms a deployment supports. A
 * platform without a registered plugin does not exist for the service: saving a connection on it is
 * refused, its hook answers `connection-not-found`, its actions answer `unsupported-action`. A later
 * plugin for the same platform replaces the earlier one in place.
 */
export const makeBotPlatformRegistry = (plugins: readonly BotPlatformPlugin[] = []): BotPlatformRegistry => {
  const byPlatform = new Map<BotPlatformId, BotPlatformPlugin>()

  const register = (plugin: BotPlatformPlugin): void => {
    byPlatform.set(plugin.platform, plugin)
  }
  plugins.forEach(register)

  const get = (platform: BotPlatformId): BotPlatformPlugin | null => byPlatform.get(platform) ?? null

  const require = (platform: BotPlatformId): BotPlatformPlugin => {
    const plugin = get(platform)
    if (plugin == null) {
      throw new BotUnsupportedAction(`platform-not-implemented:${platform}`)
    }

    return plugin
  }

  const descriptor = (platform: BotPlatformId): BotPlatformDescriptor | null => get(platform)?.descriptor ?? null

  const platforms = (): BotPlatformDescriptor[] => [...byPlatform.values()].map(plugin => plugin.descriptor)

  return { register, get, require, descriptor, platforms, plugins: () => [...byPlatform.values()] }
}
