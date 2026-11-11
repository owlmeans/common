import type { JSONSchemaType } from 'ajv'
import {
  BOT_ACTIVITY_LIMIT_MAX, BOT_CREDENTIAL_KEY_PATTERN, BOT_CREDENTIAL_MAX, BOT_CREDENTIALS_MAX, BOT_ID_MAX,
  BOT_ID_PATTERN, BOT_LABEL_MAX, BOT_NAME_MAX, BOT_PLATFORM_ID_MAX, BOT_PLATFORM_ID_PATTERN, BOT_TEXT_MAX, BotChatKind,
  BotTransport,
} from './consts.js'
import type { BotActivityQuery, BotChallengeQuery, BotHookParams, BotIdParams } from './protocols/types.js'
import type { BotConnectionInput, BotSimulateInput } from './types.js'

/**
 * Hand-written request schemas, cast: an optional key is OPTIONAL, never `null` — the wire matches the
 * TypeScript type exactly, and nothing is nullable. `additionalProperties: false` everywhere a client
 * writes.
 */
const cast = <T>(schema: object): JSONSchemaType<T> => schema as unknown as JSONSchemaType<T>

const Id = { type: 'string', minLength: 1, maxLength: BOT_ID_MAX, pattern: BOT_ID_PATTERN }
const Name = { type: 'string', maxLength: BOT_NAME_MAX }
/** A platform's own id (a chat, a user, a message) — no pattern: some platforms number chats negatively. */
const PlatformId = { type: 'string', minLength: 1, maxLength: BOT_ID_MAX }
/**
 * Which platform (`BotPlatformId`) — a pattern, never a closed list: the server answers a platform it
 * has no plugin for itself (`unsupported-action` on save, `connection-not-found` on the hook).
 */
const Platform = { type: 'string', minLength: 1, maxLength: BOT_PLATFORM_ID_MAX, pattern: BOT_PLATFORM_ID_PATTERN }

export const BotIdParamsSchema = cast<BotIdParams>({
  type: 'object',
  properties: { id: Id },
  required: ['id'],
  additionalProperties: false,
})

export const BotConnectionInputSchema = cast<BotConnectionInput>({
  type: 'object',
  properties: {
    id: Id,
    platform: Platform,
    label: { type: 'string', minLength: 1, maxLength: BOT_LABEL_MAX },
    transport: { type: 'string', enum: Object.values(BotTransport) },
    enabled: { type: 'boolean' },
    // Write-only. An omitted key keeps its stored value; an empty string is spellable so an optional
    // credential can be cleared.
    credentials: {
      type: 'object',
      propertyNames: { pattern: BOT_CREDENTIAL_KEY_PATTERN },
      additionalProperties: { type: 'string', maxLength: BOT_CREDENTIAL_MAX },
      maxProperties: BOT_CREDENTIALS_MAX,
      required: [],
    },
  },
  required: ['platform', 'label'],
  additionalProperties: false,
})

export const BotSimulateInputSchema = cast<BotSimulateInput>({
  type: 'object',
  properties: {
    text: { type: 'string', minLength: 1, maxLength: BOT_TEXT_MAX },
    chat: {
      type: 'object',
      properties: {
        id: PlatformId,
        kind: { type: 'string', enum: Object.values(BotChatKind) },
        title: Name,
        thread: PlatformId,
        space: PlatformId,
      },
      required: [],
      additionalProperties: false,
    },
    sender: {
      type: 'object',
      properties: {
        id: PlatformId,
        name: Name,
        username: Name,
        bot: { type: 'boolean' },
      },
      required: [],
      additionalProperties: false,
    },
    replyTo: {
      type: 'object',
      properties: {
        id: PlatformId,
        text: { type: 'string', maxLength: BOT_TEXT_MAX },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  required: ['text'],
  additionalProperties: false,
})

/** A query string arrives as text: the server coerces `limit` before this checks it. */
export const BotActivityQuerySchema = cast<BotActivityQuery>({
  type: 'object',
  properties: {
    connection: Id,
    limit: { type: 'integer', minimum: 1, maximum: BOT_ACTIVITY_LIMIT_MAX },
  },
  required: [],
  additionalProperties: false,
})

export const BotHookParamsSchema = cast<BotHookParams>({
  type: 'object',
  properties: {
    platform: Platform,
    connection: Id,
  },
  required: ['platform', 'connection'],
  additionalProperties: false,
})

/**
 * The handshake query. Open (`additionalProperties: true`) and declaring no key: each platform names
 * its own, and a stripping validator must never drop the one its plugin reads.
 */
export const BotChallengeQuerySchema = cast<BotChallengeQuery>({
  type: 'object',
  required: [],
  additionalProperties: true,
})
