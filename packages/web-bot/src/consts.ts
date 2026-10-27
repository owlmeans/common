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
