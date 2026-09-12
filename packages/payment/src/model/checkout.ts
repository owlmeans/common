import type { JSONSchemaType } from 'ajv'
import type { CreateCheckoutBody, CreateCheckoutResponse } from '../types.js'
import { ResourceValueSchema, EntityValueSchema, IdValueSchema } from '@owlmeans/auth'
import { schema } from '@owlmeans/entrypoint'

export const CreateCheckoutBodySchema = schema<CreateCheckoutBody>({
  type: 'object',
  properties: {
    productSku: ResourceValueSchema,
    sku: { ...ResourceValueSchema, nullable: true },
    entitySlug: EntityValueSchema,
    service: { ...ResourceValueSchema, minLength: 2 },
    amountMinor: { type: 'number', minimum: 0, multipleOf: 1, nullable: true },
    subscriptionId: { ...IdValueSchema, nullable: true },
    successUrl: { ...ResourceValueSchema, minLength: 1, nullable: true },
    cancelUrl: { ...ResourceValueSchema, minLength: 1, nullable: true },
  },
  required: ['productSku', 'entitySlug', 'service'],
  additionalProperties: false,
} as JSONSchemaType<CreateCheckoutBody>)

export const CreateCheckoutResponseSchema = schema<CreateCheckoutResponse>({
  type: 'object',
  properties: {
    url: { type: 'string', minLength: 1 },
  },
  required: ['url'],
  additionalProperties: false,
} as JSONSchemaType<CreateCheckoutResponse>)
