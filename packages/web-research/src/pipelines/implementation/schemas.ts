import type { JSONSchemaType } from 'ajv'
import type { PlanAnswer } from './types.js'

export const PlanAnswerSchema: JSONSchemaType<PlanAnswer> = {
  type: 'object',
  properties: {
    queries: { type: 'array', items: { type: 'string' }, description: 'Distinct web search queries.' },
  },
  required: ['queries'],
  additionalProperties: false,
}
