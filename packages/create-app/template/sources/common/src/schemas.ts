import type { JSONSchemaType } from 'ajv'
import type { AddItemPayload, ItemParams, SessionParams } from './types.js'

export const AddItemSchema: JSONSchemaType<AddItemPayload> = {
  type: 'object',
  properties: {
    text: { type: 'string', minLength: 1, maxLength: 280 },
  },
  required: ['text'],
  additionalProperties: false,
}

export const SessionParamsSchema: JSONSchemaType<SessionParams> = {
  type: 'object',
  properties: {
    sid: { type: 'string', minLength: 1 },
  },
  required: ['sid'],
  additionalProperties: false,
}

export const ItemParamsSchema: JSONSchemaType<ItemParams> = {
  type: 'object',
  properties: {
    sid: { type: 'string', minLength: 1 },
    id: { type: 'string', minLength: 1 },
  },
  required: ['sid', 'id'],
  additionalProperties: false,
}
