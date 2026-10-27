import type { JSONSchemaType } from 'ajv'
import {
  BOT_ACTIVITY_LIMIT_MAX, BOT_CREDENTIAL_KEY_PATTERN, BOT_CREDENTIAL_MAX, BOT_CREDENTIALS_MAX, BOT_ID_MAX,
  BOT_ID_PATTERN, BOT_LABEL_MAX, BOT_NAME_MAX, BOT_TEXT_MAX, BotChatKind, BotPlatform, BotTransport,
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
/** A platform's own id (a chat, a user, a message) — no pattern: Telegram chat ids are negative numbers. */
const PlatformId = { type: 'string', minLength: 1, maxLength: BOT_ID_MAX }

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
    platform: { type: 'string', enum: Object.values(BotPlatform) },
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
    platform: { type: 'string', enum: Object.values(BotPlatform) },
    connection: Id,
  },
  required: ['platform', 'connection'],
  additionalProperties: false,
})

/**
 * The handshake query. Open (`additionalProperties: true`): a platform adds keys at will, and a
 * stripping validator must never drop the one the server reads.
 */
export const BotChallengeQuerySchema = cast<BotChallengeQuery>({
  type: 'object',
  properties: {
    'hub.mode': { type: 'string', maxLength: BOT_NAME_MAX },
    'hub.verify_token': { type: 'string', maxLength: BOT_CREDENTIAL_MAX },
    'hub.challenge': { type: 'string', maxLength: BOT_CREDENTIAL_MAX },
  },
  required: [],
  additionalProperties: true,
})
