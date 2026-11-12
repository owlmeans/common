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

/** How many characters of a message an activity row shows. */
export const BOT_EXCERPT_MAX = 160
