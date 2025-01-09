import type { JSONSchemaType } from 'ajv'
import type { CompanyInfo } from '../types.js'
import { EntityValueSchema, ResourceValueSchema } from '@owlmeans/auth'

export const CompanyInfoSchema: JSONSchemaType<CompanyInfo> = {
  type: 'object',
  properties: {
    resource: { ...ResourceValueSchema, minLength: 0, nullable: true },
    entityId: { ...EntityValueSchema },
    fullName: { type: 'string', minLength: 1, maxLength: 128 },
    shortName: { type: 'string', minLength: 0, maxLength: 32 },
    slug: { ...EntityValueSchema, minLength: 0 },
    description: { type: 'string', minLength: 0, maxLength: 512 }
  },
  required: ['entityId', 'fullName', 'shortName', 'slug', 'description'],
  additionalProperties: false,
}
