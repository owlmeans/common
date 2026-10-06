import type { JSONSchemaType } from 'ajv'
import type { SurrogateQuery } from './types.js'

export const SurrogateQuerySchema: JSONSchemaType<SurrogateQuery> = {
  type: 'object',
  properties: {
    intent: { type: 'string', maxLength: 32, nullable: true },
    next: { type: 'string', maxLength: 2048, nullable: true },
    method: { type: 'string', maxLength: 128, nullable: true },
  },
  additionalProperties: true,
}
