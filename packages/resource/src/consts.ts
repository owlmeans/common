import type { JSONSchemaType } from 'ajv'
import type { ListResult, ResourceRecord } from './types.js'

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
    pager: {
      type: 'object',
      properties: {
        sort: {
          type: 'array',
          items: {
            oneOf: [
              { type: 'string' },
              {
                type: 'array', items: [
                  { type: 'string' },
                  { type: 'boolean', nullable: true }
                ], minItems: 1, maxItems: 2
              }
            ]
          },
          nullable: true
        },
        page: { type: 'number', nullable: true },
        size: { type: 'number', nullable: true },
        total: { type: 'number', nullable: true }
      },
      required: [],
      nullable: true,
      additionalProperties: false,
    }
  },
  required: ['items'],
  additionalProperties: false,
})
