import { BotRuleAction } from '@owlmeans/bot'

/**
 * The library-tier i18n resource this package registers under.
 *
 * Every string the panels render is addressed as `lib : bot.<key>`, so an application overrides any
 * of them by registering the same resource at the app tier, in the library namespace.
 */
export const BOT_I18N = 'bot'

/** How often the activity panel reads again while the page is visible. */
export const BOT_ACTIVITY_REFRESH_MS = 5_000

/** The page sizes the activity panel offers — every one within `BOT_ACTIVITY_LIMIT_MAX`. */
export const BOT_ACTIVITY_LIMITS = Object.freeze([20, 50, 100, 200])

/** How often the simulator reads the activity while it waits for the bot's reaction. */
export const BOT_SIMULATOR_POLL_MS = 1_500

/** How long the simulator waits for a first reaction before it says the bot stayed silent. */
export const BOT_SIMULATOR_WAIT_MS = 45_000

/** How long the simulator keeps reading after the first reaction, for the ones that follow it. */
export const BOT_SIMULATOR_SETTLE_MS = 6_000

/** The rule actions whose group carries a fixed text — the reply, the warning, the confirmation. */
export const BOT_TEXT_ACTIONS: readonly BotRuleAction[] = Object.freeze([
  BotRuleAction.Reply, BotRuleAction.Warn, BotRuleAction.Record,
])

/** The rule actions that cannot be saved without their text. */
export const BOT_TEXT_REQUIRED_ACTIONS: readonly BotRuleAction[] = Object.freeze([
  BotRuleAction.Reply, BotRuleAction.Warn,
])

/**
 * The Discord permissions the invite link asks for: view channels, send messages (and in threads),
 * read history, add reactions, manage messages (delete), moderate members (time-out) and ban members
 * — exactly what the platform descriptor's actions need, nothing administrative.
 */
export const BOT_DISCORD_PERMISSIONS = '1374389611588'

/** Where a Discord bot is invited to a server. */
export const BOT_DISCORD_INVITE_URL = 'https://discord.com/oauth2/authorize'

/** How many characters of a message an activity row shows. */
export const BOT_EXCERPT_MAX = 160
