
import type { JSONSchemaType } from 'ajv'
import type { ProvideParams } from '../types.js'
import { EntityValueSchema } from '@owlmeans/auth'

export const ProvideParamsSchema: JSONSchemaType<ProvideParams> = {
  type: 'object',
  properties: {
    entity: { ...EntityValueSchema }
  },
  required: ['entity'],
  additionalProperties: false,
}
