import { telegramBotPlatform } from './telegram/index.js'
import { whatsappBotPlatform } from './whatsapp/index.js'
import { slackBotPlatform } from './slack/index.js'
import { discordBotPlatform } from './discord/index.js'
import type { BotPlatformPlugin } from './types.js'

/**
 * The implemented platforms a service gets by default. A platform the contract declares without an
 * entry here is pending (`BotPlatformRegistry.platforms()` lists it `implemented: false`).
 *
 * Adding one: its folder `src/platforms/<platform>/` exporting `<platform>BotPlatform`, ONE entry
 * here (and its import), and its barrel line in `src/platforms/index.ts`.
 */
export const BOT_BUILTIN_PLATFORMS: readonly BotPlatformPlugin[] = Object.freeze([
  telegramBotPlatform,
  slackBotPlatform,
  whatsappBotPlatform,
  discordBotPlatform,
])
