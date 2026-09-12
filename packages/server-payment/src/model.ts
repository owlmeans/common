import type { JSONSchemaType } from 'ajv'
import { PermissionSetSchema } from '@owlmeans/auth'
import { LimitConfigSchema } from '@owlmeans/payment'
import type { FingerprintRecord, PaygateCustomerRecord, PaymentSubscriptionRecord } from './types.js'

export const PaygateCustomerSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', nullable: true }, paygate: { type: 'string' }, externalId: { type: 'string' },
    entityId: { type: 'string', nullable: true }, profileId: { type: 'string', nullable: true },
    email: { type: 'string', nullable: true }, name: { type: 'string', nullable: true },
    taxId: { type: 'string', nullable: true },
  },
  required: ['paygate', 'externalId'], additionalProperties: true,
} as unknown as JSONSchemaType<PaygateCustomerRecord>

export const PaymentSubscriptionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', nullable: true }, sku: { type: 'string' }, productSku: { type: 'string' },
    entityId: { type: 'string' }, service: { type: 'string' }, paygate: { type: 'string' },
    externalId: { type: 'string' }, status: { type: 'string' }, kind: { type: 'string' },
    capabilities: { type: 'array', items: PermissionSetSchema as never, nullable: true },
    limits: { type: 'object', nullable: true, additionalProperties: LimitConfigSchema as never, required: [] },
  },
  required: ['sku', 'productSku', 'entityId', 'service', 'paygate', 'externalId', 'status', 'kind'],
  additionalProperties: true,
} as unknown as JSONSchemaType<PaymentSubscriptionRecord>

export const FingerprintSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', nullable: true }, sku: { type: 'string' }, hash: { type: 'string' },
    productId: { type: 'string', nullable: true },
  },
  required: ['sku', 'hash'], additionalProperties: true,
} as unknown as JSONSchemaType<FingerprintRecord>
