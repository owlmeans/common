import type { JSONSchemaType } from 'ajv'
import type { PlanSubscription } from '../types.js'
import { ResourceValueSchema, PermissionSetSchema, DateSchema, EntityValueSchema, IdValueSchema } from '@owlmeans/auth'
import { SubscriptionStatusSchema } from '../consts.js'
import { CapabilityUsageSchema, LimitConfigSchema } from './utils.js'

export const PlanSubscriptionSchema: JSONSchemaType<PlanSubscription> = {
  type: 'object',
  properties: {
    sku: ResourceValueSchema,
    entityId: EntityValueSchema,
    paymentMethod: { ...IdValueSchema, nullable: true },
    externalId: { ...IdValueSchema, nullable: true },
    createdAt: DateSchema,
    lastPaymentAt: { ...DateSchema, nullable: true },
    trialUntil: { ...DateSchema, nullable: true },
    startsdAt: DateSchema,
    expirationAt: { ...DateSchema, nullable: true },
    endsAt: { ...DateSchema, nullable: true },
    archiveAt: { ...DateSchema, nullable: true },
    suspendedAt: { ...DateSchema, nullable: true },
    canceledAt: { ...DateSchema, nullable: true },
    blockedAt: { ...DateSchema, nullable: true },
    suspendedUntil: { ...DateSchema, nullable: true },
    status: SubscriptionStatusSchema,
    capabilities: { type: 'array', items: PermissionSetSchema, nullable: true },
    limits: {
      type: 'object', required: [], nullable: true,
      additionalProperties: LimitConfigSchema
    },
    consumptions: {
      type: 'object', required: [], nullable: true,
      additionalProperties: CapabilityUsageSchema
    }
  },
  required: ['sku', 'entityId', 'createdAt', 'startsdAt', 'status']
}
