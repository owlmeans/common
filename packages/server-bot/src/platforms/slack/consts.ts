/** The Web API (https://docs.slack.dev/apis/web-api/) — override `base` for a proxy or a fake server. */
export const SLACK_API_BASE = 'https://slack.com/api'

/** The headers Slack signs an Events API request with (lower-cased, as servers hand them over). */
export const SLACK_SIGNATURE_HEADER = 'x-slack-signature'
export const SLACK_TIMESTAMP_HEADER = 'x-slack-request-timestamp'
/** Set on a redelivery (1, 2, 3) — the inbox's dedupe key absorbs it. */
export const SLACK_RETRY_NUM_HEADER = 'x-slack-retry-num'

/** The signature scheme: `v0=` + hex HMAC-SHA256(signing secret, `v0:<timestamp>:<raw body>`). */
export const SLACK_SIGNATURE_VERSION = 'v0'

/** A request whose timestamp is further than this from now is a replay (seconds). */
export const SLACK_SIGNATURE_TOLERANCE_S = 300

/** How long one Web API call may take. */
export const SLACK_CALL_TIMEOUT_MS = 15_000

/** Retries of a call answered 429, waiting its `Retry-After` each time. */
export const SLACK_RATE_LIMIT_RETRIES = 2

/** A `Retry-After` longer than this (seconds) is not waited for: the call fails `ratelimited`. */
export const SLACK_RATE_LIMIT_MAX_WAIT_S = 30

/** The wait when a 429 names none (seconds). */
export const SLACK_RATE_LIMIT_DEFAULT_WAIT_S = 1

/** Slack truncates longer text; it is clipped here first, without splitting a surrogate pair. */
export const SLACK_TEXT_MAX = 40_000

/** The `message` subtypes that are a member's new message — every other subtype is ignored. */
export const SLACK_MESSAGE_SUBTYPES = Object.freeze(['thread_broadcast', 'file_share', 'me_message'])

/** The subtype of an edit; it carries the new message in `message`. */
export const SLACK_EDIT_SUBTYPE = 'message_changed'

/** `auth.test` refusals that mean the token itself is wrong — `BotCredentialsRejected`, not a fault. */
export const SLACK_CREDENTIAL_ERRORS = Object.freeze([
  'invalid_auth', 'not_authed', 'account_inactive', 'token_revoked', 'token_expired', 'not_allowed_token_type',
])

/** The bot events a connection subscribes to (Event Subscriptions → Subscribe to bot events). */
export const SLACK_BOT_EVENTS = Object.freeze(['message.channels', 'message.groups', 'message.im', 'app_mention'])

/** The bot token scopes the plugin's calls and events need. */
export const SLACK_BOT_SCOPES = Object.freeze([
  'chat:write', 'channels:history', 'groups:history', 'im:history', 'app_mentions:read', 'reactions:write',
])

/** The user token scope `chat.delete` needs with an admin's token. */
export const SLACK_USER_SCOPES = Object.freeze(['chat:write'])

/** What a person does first: the credentials, saved before Slack checks the Request URL. */
export const SLACK_SETUP_CREDENTIALS_STEP = 'In your Slack app (https://api.slack.com/apps) add the bot token scopes '
  + `${SLACK_BOT_SCOPES.join(', ')} under OAuth & Permissions and install the app to the workspace; save its Bot `
  + 'User OAuth Token (xoxb-…) as botToken and the Signing Secret (Basic Information → App Credentials) as '
  + 'signingSecret on this connection BEFORE the next step — Slack checks the Request URL at once.'

/** Followed by the connection's hook URL. */
export const SLACK_SETUP_HOOK_STEP = 'Under Event Subscriptions, turn events on and paste the Request URL: '

/** When the connection has no hook URL yet (saved without the application's public address). */
export const SLACK_SETUP_HOOK_PENDING_STEP = 'Under Event Subscriptions, turn events on and paste this connection\'s '
  + 'Request URL — open the connection from the application\'s public address to see it.'

/** The rest of the manual setup. */
export const SLACK_SETUP_TAIL_STEPS = Object.freeze([
  `Under "Subscribe to bot events" add ${SLACK_BOT_EVENTS.join(', ')}, save, and reinstall the app if Slack asks.`,
  'Invite the bot to every channel it should read (/invite @your-bot) — it only sees channels it is a member of.',
  'Optional, to delete members\' messages: a workspace admin or owner adds the user token scope '
  + `${SLACK_USER_SCOPES.join(', ')}, reinstalls the app and saves their User OAuth Token (xoxp-…) as userToken; `
  + 'without it the bot warns instead of deleting.',
])

/**
 * Slack reacts by emoji NAME. A Unicode emoji a handler written for any platform passes is mapped
 * here (variation selectors stripped first); an unknown one goes as given and Slack answers `invalid_name`.
 */
export const SLACK_EMOJI_NAMES: Readonly<Record<string, string>> = Object.freeze({
  '👍': '+1',
  '👎': '-1',
  '✅': 'white_check_mark',
  '✔': 'heavy_check_mark',
  '❌': 'x',
  '⚠': 'warning',
  '🚫': 'no_entry_sign',
  '⛔': 'no_entry',
  '🛑': 'octagonal_sign',
  '👀': 'eyes',
  '🙏': 'pray',
  '❤': 'heart',
  '🔥': 'fire',
  '🎉': 'tada',
  '👋': 'wave',
  '😂': 'joy',
  '😀': 'grinning',
  '🙂': 'slightly_smiling_face',
  '😢': 'cry',
  '😡': 'rage',
  '🤔': 'thinking_face',
  '💯': '100',
  '⭐': 'star',
  '🦉': 'owl',
})

/** The mock's simulated defaults: one public channel and one member of the fake workspace. */
export const SLACK_MOCK_CHANNEL_ID = 'C0MOCK00001'
export const SLACK_MOCK_MEMBER_ID = 'U0MOCK00001'
/** Who wrote a simulated thread's parent when it was not the fake bot. */
export const SLACK_MOCK_OTHER_ID = 'U0MOCK00002'
export const SLACK_MOCK_TEAM_NAME = 'Mock workspace'
/** The deprecated verification token every Events API payload still carries — ignored by the plugin. */
export const SLACK_MOCK_VERIFICATION_TOKEN = 'mock-verification-token'
/** A mock `event_id` is `Ev` and this many random characters of {@link SLACK_MOCK_EVENT_ID_ALPHABET}. */
export const SLACK_MOCK_EVENT_ID_LENGTH = 10
export const SLACK_MOCK_EVENT_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
