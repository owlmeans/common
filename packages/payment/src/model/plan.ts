import type { JSONSchemaType } from 'ajv'
import type { ProductPlan } from '../types.js'
import { ResourceValueSchema, DateSchema, IdValueSchema } from '@owlmeans/auth'
import {
  CheckoutPricingModeSchema, PlanDurationSchema, PlanStatusSchema, ProductDescriptionSchema,
  ProductTitleSchema
} from '../consts.js'
import { LimitDeclarationSchema, PlanCapabilitySchema } from './limit.js'
import { AmountCheckoutPolicySchema, QuantityCheckoutPolicySchema } from './pricing.js'

export const ProductPlanSchema: JSONSchemaType<ProductPlan> = {
  type: 'object',
  properties: {
    productSku: ResourceValueSchema,
    sku: ResourceValueSchema,
    status: PlanStatusSchema,
    rank: { type: 'number', minimum: 0, multipleOf: 1, nullable: true },
    free: { type: 'boolean', nullable: true },
    gateways: { type: 'array', items: IdValueSchema, nullable: true },
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
    suspendedAt: { ...DateSchema, nullable: true },

    capabilities: { type: 'array', items: PlanCapabilitySchema, nullable: true },
    limits: {
      type: 'object', required: [], nullable: true,
      additionalProperties: LimitDeclarationSchema
    },
    pricingMode: { ...CheckoutPricingModeSchema, nullable: true },
    amountPolicy: { ...AmountCheckoutPolicySchema, nullable: true },
    quantityPolicy: { ...QuantityCheckoutPolicySchema, nullable: true },
  },
  required: [
    'productSku', 'sku', 'status', 'duration',
    'price', 'title'
  ],
  additionalProperties: false,
}
