import { BotActionKind, BotConnectionStatus, BotPlatform, BotReceiveMode, BotTransport } from '@owlmeans/bot'
import type { JSONSchemaType } from 'ajv'
import { BotInboxStatus } from './consts.js'
import type { BotActivityRecord, BotConnectionRecord, BotUpdateRecord } from './types.js'

/**
 * The stored records' schemas — the ONE declaration a store package registers its resources with
 * (`resource.schema = BotConnectionRecordSchema`), never a copy. Timestamps are ISO strings with no
 * `format` (a Postgres store keeps them as text, sortable as stored); an optional field is
 * `nullable`, and the service reads `null` as absent. Nested objects (identity, the inbox payload,
 * an activity target) are one JSON column each; string lists are native arrays.
 */
const cast = <T>(schema: object): JSONSchemaType<T> => schema as unknown as JSONSchemaType<T>

const text = { type: 'string' }
const required = { type: 'string', minLength: 1 }
const optional = { type: 'string', nullable: true }
const strings = { type: 'array', items: { type: 'string' } }
const platform = { type: 'string', enum: Object.values(BotPlatform) }

export const BotConnectionRecordSchema = cast<BotConnectionRecord>({
  type: 'object',
  properties: {
    id: required,
    scope: required,
    platform,
    label: text,
    transport: { type: 'string', enum: Object.values(BotTransport) },
    status: { type: 'string', enum: Object.values(BotConnectionStatus) },
    enabled: { type: 'boolean' },
    receive: { type: 'string', enum: Object.values(BotReceiveMode) },
    identity: {
      type: 'object',
      nullable: true,
      properties: { id: text, username: optional, name: optional },
      required: ['id'],
      additionalProperties: false,
    },
    hookUrl: optional,
    hookRegistered: { type: 'boolean', nullable: true },
    setup: { ...strings, nullable: true },
    credentialsSet: strings,
    sealed: optional,
    hookSecret: required,
    lastError: optional,
    createdAt: required,
    updatedAt: required,
  },
  required: [
    'id', 'scope', 'platform', 'label', 'transport', 'status', 'enabled', 'receive', 'credentialsSet', 'hookSecret',
    'createdAt', 'updatedAt',
  ],
  additionalProperties: false,
})

/** The normalized update an inbox row carries — open: `raw` is the platform's own payload. */
const InboxPayloadSchema = {
  type: 'object',
  properties: {
    connection: text,
    scope: text,
    platform,
    kind: text,
    chat: { type: 'object', required: ['id', 'kind'], additionalProperties: true },
    addressed: { type: 'boolean' },
    receivedAt: text,
  },
  required: ['connection', 'scope', 'platform', 'kind', 'chat', 'addressed', 'receivedAt'],
  additionalProperties: true,
}

export const BotUpdateRecordSchema = cast<BotUpdateRecord>({
  type: 'object',
  properties: {
    id: required,
    scope: required,
    connection: required,
    platform,
    dedupe: required,
    status: { type: 'string', enum: Object.values(BotInboxStatus) },
    attempts: { type: 'integer' },
    handled: strings,
    update: InboxPayloadSchema,
    error: optional,
    receivedAt: required,
    claimedAt: optional,
    retryAt: optional,
    processedAt: optional,
  },
  required: [
    'id', 'scope', 'connection', 'platform', 'dedupe', 'status', 'attempts', 'handled', 'update', 'receivedAt',
  ],
  additionalProperties: false,
})

export const BotActivityRecordSchema = cast<BotActivityRecord>({
  type: 'object',
  properties: {
    id: required,
    scope: required,
    connection: required,
    platform,
    update: optional,
    action: { type: 'string', enum: Object.values(BotActionKind) },
    target: {
      type: 'object',
      nullable: true,
      properties: { chat: text, message: optional, user: optional },
      required: ['chat'],
      additionalProperties: false,
    },
    text: optional,
    ref: optional,
    ok: { type: 'boolean' },
    error: optional,
    code: optional,
    transport: { type: 'string', enum: Object.values(BotTransport) },
    at: required,
  },
  required: ['id', 'scope', 'connection', 'platform', 'action', 'ok', 'transport', 'at'],
  additionalProperties: false,
})
