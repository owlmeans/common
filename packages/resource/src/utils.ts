import type { ListResult, ResourceRecord } from './types.js'
import type { JSONSchemaType } from 'ajv'

export const createListSchema = <T extends ResourceRecord>(schema: JSONSchemaType<T>): JSONSchemaType<ListResult<T>> => ({
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        ...schema,
        type: 'object',
        properties: {
          id: { type: 'string', nullable: true },
          ...schema.properties
        },
        ...(schema.required ? { required: [...schema.required] } : undefined),
        additionalProperties: false,
      }
    },
    total: { type: 'number' },
    page: { type: 'number', nullable: true },
    size: { type: 'number', nullable: true }
  },
  required: ['items', 'total'],
  additionalProperties: false,
})
