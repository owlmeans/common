import type { BotPlatform, BotPlatformDescriptor } from '@owlmeans/bot'
import type { BotPlatformPlugin } from '../types.js'

/** A platform of the contract and whether this deployment has its plugin. */
export interface BotPlatformEntry {
  platform: BotPlatform
  descriptor: BotPlatformDescriptor
  /** `false`: declared by the contract, no plugin registered — its connections cannot be saved. */
  implemented: boolean
}

/** The plugins of one service, over every platform `BOT_PLATFORMS` declares. */
export interface BotPlatformRegistry {
  /** The platform's plugin, or `null` while it has none. */
  get: (platform: BotPlatform) => BotPlatformPlugin | null
  /** @throws {BotUnsupportedAction} `platform-not-implemented:<platform>` */
  require: (platform: BotPlatform) => BotPlatformPlugin
  /** Every platform of the contract, in `BOT_PLATFORMS` order, implemented or not. */
  platforms: () => BotPlatformEntry[]
  /** The registered plugins. */
  plugins: () => BotPlatformPlugin[]
}
