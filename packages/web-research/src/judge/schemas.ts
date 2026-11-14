import type { JSONSchemaType } from 'ajv'
import type { InjectionAnswer } from './types.js'

export const InjectionAnswerSchema: JSONSchemaType<InjectionAnswer> = {
  type: 'object',
  properties: {
    injection: { type: 'boolean' },
    quote: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['injection', 'quote', 'reason'],
  additionalProperties: false,
}
