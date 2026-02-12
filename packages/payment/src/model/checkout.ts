import type { JSONSchemaType } from 'ajv'
import type { CreateCheckoutBody, CreateCheckoutResponse } from '../types.js'
import { ResourceValueSchema, EntityValueSchema, IdValueSchema } from '@owlmeans/auth'

export const CreateCheckoutBodySchema: JSONSchemaType<CreateCheckoutBody> = {
  type: 'object',
  properties: {
    productSku: ResourceValueSchema,
    sku: { ...ResourceValueSchema, nullable: true },
    entityId: EntityValueSchema,
    service: { ...ResourceValueSchema, minLength: 2 },
    subscriptionId: { ...IdValueSchema, nullable: true },
    successUrl: { ...ResourceValueSchema, minLength: 1, nullable: true },
    cancelUrl: { ...ResourceValueSchema, minLength: 1, nullable: true },
  },
  required: ['productSku', 'entityId', 'service'],
  additionalProperties: false,
}

export const CreateCheckoutResponseSchema: JSONSchemaType<CreateCheckoutResponse> = {
  type: 'object',
  properties: {
    url: { type: 'string', minLength: 1 },
  },
  required: ['url'],
  additionalProperties: false,
}