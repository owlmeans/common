import type { JSONSchemaType } from 'ajv'
import type { ConsentParams } from './types.js'

export const ConsentParamsSchema: JSONSchemaType<ConsentParams> = {
  type: 'object',
  properties: { ref: { type: 'string', minLength: 1, maxLength: 128 } },
  required: ['ref'],
  additionalProperties: false,
}
