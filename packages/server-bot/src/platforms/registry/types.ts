import type { BotPlatformDescriptor, BotPlatformId } from '@owlmeans/bot'
import type { BotPlatformPlugin } from '../types.js'

/** The plugins of one service — the platforms it supports, and nothing else. */
export interface BotPlatformRegistry {
  /** Add a plugin; one for a platform already registered replaces it in place. */
  register: (plugin: BotPlatformPlugin) => void
  /** The platform's plugin, or `null` while it has none. */
  get: (platform: BotPlatformId) => BotPlatformPlugin | null
  /** @throws {BotUnsupportedAction} `platform-not-implemented:<platform>` */
  require: (platform: BotPlatformId) => BotPlatformPlugin
  /** The registered plugin's descriptor, or `null` while the platform has none. */
  descriptor: (platform: BotPlatformId) => BotPlatformDescriptor | null
  /** The registered plugins' descriptors, in registration order. */
  platforms: () => BotPlatformDescriptor[]
  /** The registered plugins, in registration order. */
  plugins: () => BotPlatformPlugin[]
}
