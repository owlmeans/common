import type { JSONSchemaType } from 'ajv'
import type { ProductPlan } from '../types.js'
import { ResourceValueSchema, PermissionSetSchema, DateSchema } from '@owlmeans/auth'
import {
  PlanDurationSchema, ProductDescriptionSchema, ProductTitleSchema,
  SubscriptionStatusSchema
} from '../consts.js'
import { LimitConfigSchema } from './utils.js'

export const ProductPlanSchema: JSONSchemaType<ProductPlan> = {
  type: 'object',
  properties: {
    productSku: ResourceValueSchema,
    sku: ResourceValueSchema,
    status: SubscriptionStatusSchema,
    payagateAliases: {
      type: 'object', required: [], nullable: true,
      additionalProperties: { type: 'string' },
    },
    duration: PlanDurationSchema,
    trial: { type: 'number', nullable: true },
    gatedTrial: { type: 'boolean', nullable: true },
    price: { type: 'number', minimum: 0 },
    order: { type: 'number', nullable: true },
    highlight: { type: 'string', minLength: 1, maxLength: 32, nullable: true },
    currency: { type: 'string', minLength: 2, maxLength: 3, nullable: true },
    originalPrice: { type: 'number', minimum: 0, nullable: true },
    discount: { type: 'number', minimum: 0, nullable: true },
    awaitingInterval: { type: 'number', minimum: 0, nullable: true },

    title: ProductTitleSchema,
    description: { ...ProductDescriptionSchema, nullable: true },
    customUrl: { type: 'string', maxLength: 256, nullable: true },

    createdAt: { ...DateSchema, nullable: true },
    archivedAt: { ...DateSchema, nullable: true },
    deprecatedAt: { ...DateSchema, nullable: true },
    supsendedAt: { ...DateSchema, nullable: true },

    capabilities: { type: 'array', items: PermissionSetSchema, nullable: true },
    limits: {
      type: 'object', required: [], nullable: true,
      additionalProperties: LimitConfigSchema
    },
  },
  required: [
    'productSku', 'sku', 'status', 'duration',
    'price', 'title'
  ],
  additionalProperties: false,
}
