import type { BotErrorKey } from '../../types.js'

/**
 * `bot:<marker>:<detail>` — how every `BotError` message starts, whatever hop it survived. A
 * connection's `lastError` may carry the step that failed in front (`receiver:` — its poll or gateway
 * receiver, `hook:` — registering its webhook).
 */
export const BOT_ERROR_MARKER = /^(?:(?:receiver|hook):)?bot:([a-z-]+)(?::([\s\S]*))?$/

/** The marker of a platform's API error: `bot:platform:<id>:<detail>` (`BotErrorPlatform`). */
export const BOT_ERROR_PLATFORM_MARKER = 'platform'

/** The markers this package has a sentence for, by the copy key that holds it. */
export const BOT_ERROR_MARKERS: Readonly<Record<string, BotErrorKey>> = Object.freeze({
  'connection-not-found': 'connection-not-found',
  'credentials-rejected': 'credentials-rejected',
  'signature-rejected': 'signature-rejected',
  'transport-mismatch': 'transport-mismatch',
  'unsupported-action': 'unsupported-action',
  // @owlmeans/server-bot's own refusals
  'connection-disabled': 'connection-disabled',
  'secret-missing': 'secret-missing',
  'credentials-unreadable': 'credentials-unreadable',
  // every platform's API error — one sentence, the platform's words as the detail
  [BOT_ERROR_PLATFORM_MARKER]: 'platform-refused',
})

/**
 * `@owlmeans/server-bot`'s error classes by their `typeName`, mirrored as strings: this package never
 * loads server-bot, so a refusal of its classes reaches the browser as a `ResilientError` that keeps
 * only its `type`. `@owlmeans/bot`'s own classes (`BotErrorPlatform` among them) are told by `instanceof`.
 */
export const BOT_ERROR_TYPES: Readonly<Record<string, BotErrorKey>> = Object.freeze({
  BotErrorConnectionDisabled: 'connection-disabled',
  BotErrorSecretMissing: 'secret-missing',
  BotErrorCredentialsUnreadable: 'credentials-unreadable',
})

/** The type-name prefix of the bot error family — what a stored legacy platform type name starts with. */
export const BOT_ERROR_TYPE_PREFIX = 'BotError'

/** The keys whose sentence carries the detail itself (`{{detail}}`) instead of under it. */
export const BOT_ERROR_INLINE_DETAIL: readonly BotErrorKey[] = Object.freeze(['platform-refused'])
