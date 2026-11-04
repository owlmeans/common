export const MAX_ITEMS = 50
export const MAX_ERROR_CAUSE_DEPTH = 3
export const MAX_ERROR_CAUSE_MESSAGE = 500
export const MAX_ERROR_CAUSE_STACK = 1000
export const MAX_TEXT_ERROR_CAUSE = 1400

/** What a whole error stands for when none of it could be read. */
export const UNSERIALIZABLE = '[unserializable]'

/**
 * A provider key (`sk-…`): at least 12 characters after `sk-` and never inside a hyphenated id, so
 * `task-sk-12` stays prose.
 */
export const KEY_TOKEN = /(?<![\w-])sk-[A-Za-z0-9_*.-]{11,}[A-Za-z0-9_*]/g
export const REDACTED_KEY = '[redacted-key]'

/** A bearer credential of at least 8 token characters. */
export const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi
export const REDACTED_BEARER = 'Bearer [redacted]'

/**
 * A secret-named key (bare or JSON-quoted) followed by a token-like value of at least 8 characters,
 * optionally behind an auth scheme, which stays (`Authorization: Basic [redacted]`):
 * `Invalid password: must contain 8 characters` and `device-authorization:503` stay prose.
 */
export const KEYED_SECRET = /((?:authorization|cookie|passw(?:or)?d|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)["']?\s*[:=]\s*["']?(?:(?:basic|bearer|digest|token|negotiate)\s+)?)([^\s"',;}\]]{8,})/gi
