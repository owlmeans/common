/** The Bot API server — override `base` for a self-hosted one (https://github.com/tdlib/telegram-bot-api). */
export const TELEGRAM_API_BASE = 'https://api.telegram.org'

/** The header Telegram sends a webhook's `secret_token` in (lower-cased, as servers hand it over). */
export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token'

/** The update kinds a connection subscribes to — `setWebhook` and `getUpdates` alike. */
export const TELEGRAM_ALLOWED_UPDATES = Object.freeze(['message', 'edited_message', 'channel_post'])

/** Long-polling timeout of `getUpdates`, in seconds. */
export const TELEGRAM_POLL_TIMEOUT_S = 25

/** How long one ordinary Bot API call may take. */
export const TELEGRAM_CALL_TIMEOUT_MS = 15_000

/**
 * The Bot API's answers that mean the token itself is refused — 401 Unauthorized (revoked) and
 * 404 Not Found (no such bot). Verification turns them into `BotCredentialsRejected`; a receiver
 * meeting one stops for good (the connection fails until it is verified or saved again).
 */
export const TELEGRAM_FATAL_CODES: readonly number[] = Object.freeze([401, 404])

/** `sendMessage` text limit (characters after entity parsing) — longer text is clipped. */
export const TELEGRAM_TEXT_MAX = 4096

/** The ports `setWebhook` accepts. */
export const TELEGRAM_HOOK_PORTS = Object.freeze([443, 80, 88, 8443])

/** Every send permission off — what `mute` restricts (`use_independent_chat_permissions: true`). */
export const TELEGRAM_MUTED_PERMISSIONS = Object.freeze({
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
  can_react_to_messages: false,
})

/** What a person does in Telegram for the bot to see and moderate a group. */
export const TELEGRAM_SETUP_STEPS = Object.freeze([
  'Add the bot to your group or channel.',
  'Make it an administrator with the rights to delete messages and to ban (restrict) members — moderation needs them.',
  'Without administrator rights a bot sees only commands, mentions and replies to it: turn privacy mode off in @BotFather (/setprivacy → Disable) for it to read every message.',
])

/** The mock's simulated defaults: a supergroup, one member. */
export const TELEGRAM_MOCK_GROUP_ID = -1001000000001
export const TELEGRAM_MOCK_GROUP_TITLE = 'Simulated group'
export const TELEGRAM_MOCK_SENDER_ID = 424242001
export const TELEGRAM_MOCK_SENDER_NAME = 'Test member'
/** The largest `message_id` / `update_id` the Bot API hands out: a signed 32-bit integer. */
export const TELEGRAM_ID_MAX = 2_147_483_647
/**
 * The ids a mock sequence keeps free above its random start — what one process lifetime of a
 * connection may mint before the sequence starts afresh at another random point.
 */
export const TELEGRAM_MOCK_ID_HEADROOM = 16_777_216
