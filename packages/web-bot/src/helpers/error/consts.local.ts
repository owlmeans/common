import type { BotErrorKey } from '../../types.js'

/**
 * `bot:<marker>:<detail>` — how every `BotError` message starts, whatever hop it survived. A
 * connection's `lastError` may carry the step that failed in front (`receiver:` — its poll or gateway
 * receiver, `hook:` — registering its webhook).
 */
export const BOT_ERROR_MARKER = /^(?:(?:receiver|hook):)?bot:([a-z-]+)(?::([\s\S]*))?$/

/** The markers this package has a sentence for, by the copy key that holds it. */
export const BOT_ERROR_MARKERS: Readonly<Record<string, BotErrorKey>> = Object.freeze({
  'connection-not-found': 'connection-not-found',
  'credentials-rejected': 'credentials-rejected',
  'signature-rejected': 'signature-rejected',
  'transport-mismatch': 'transport-mismatch',
  'unsupported-action': 'unsupported-action',
  // @owlmeans/server-bot's own refusals
  'rule-not-found': 'rule-not-found',
  'rule-invalid': 'rule-invalid',
  'connection-disabled': 'connection-disabled',
  'secret-missing': 'secret-missing',
  'credentials-unreadable': 'credentials-unreadable',
  // @owlmeans/server-bot's platform API errors — one sentence, the platform's words as the detail
  telegram: 'platform-refused',
  whatsapp: 'platform-refused',
  discord: 'platform-refused',
  'discord-gateway': 'platform-refused',
  slack: 'platform-refused',
})

/**
 * `@owlmeans/server-bot`'s error classes by their `typeName`, mirrored as strings: this package never
 * loads server-bot, so a refusal of its classes reaches the browser as a `ResilientError` that keeps
 * only its `type`. `@owlmeans/bot`'s own classes are told by `instanceof`.
 */
export const BOT_ERROR_TYPES: Readonly<Record<string, BotErrorKey>> = Object.freeze({
  BotErrorRuleNotFound: 'rule-not-found',
  BotErrorRuleInvalid: 'rule-invalid',
  BotErrorConnectionDisabled: 'connection-disabled',
  BotErrorSecretMissing: 'secret-missing',
  BotErrorCredentialsUnreadable: 'credentials-unreadable',
  BotErrorTelegram: 'platform-refused',
  BotErrorWhatsApp: 'platform-refused',
  BotErrorDiscord: 'platform-refused',
  BotErrorDiscordGateway: 'platform-refused',
  BotErrorSlack: 'platform-refused',
})

/** The keys whose sentence carries the detail itself (`{{detail}}`) instead of under it. */
export const BOT_ERROR_INLINE_DETAIL: readonly BotErrorKey[] = Object.freeze(['platform-refused'])
