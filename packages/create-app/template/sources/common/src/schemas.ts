import { schema } from '@owlmeans/entrypoint'
import type { AddItemPayload, ItemParams, SessionParams } from './types.js'

export const AddItemSchema = schema<AddItemPayload>({
  type: 'object',
  properties: {
    text: { type: 'string', minLength: 1, maxLength: 280 },
  },
  required: ['text'],
  additionalProperties: false,
})

export const SessionParamsSchema = schema<SessionParams>({
  type: 'object',
  properties: {
    sid: { type: 'string', minLength: 1 },
  },
  required: ['sid'],
  additionalProperties: false,
})

export const ItemParamsSchema = schema<ItemParams>({
  type: 'object',
  properties: {
    sid: { type: 'string', minLength: 1 },
    id: { type: 'string', minLength: 1 },
  },
  required: ['sid', 'id'],
  additionalProperties: false,
})
