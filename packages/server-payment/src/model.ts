import type { JSONSchemaType } from 'ajv'
import { DateSchema } from '@owlmeans/auth'
import { CheckoutPricingModeSchema, SubscriptionStatusSchema } from '@owlmeans/payment'
import type {
  FingerprintRecord, PaygateCustomerRecord, PaymentFulfillmentRecord, PaymentSubscriptionRecord,
  PaymentUsageCounterRecord, PaymentUsageRecord, PaymentWebhookRecord,
} from './types.js'

/**
 * Record schemas. Every stored property is declared: the resource coerces a write through its
 * schema, and a property the schema does not know is written as a string. Dates follow the record
 * convention (`DateSchema`). None of these records declares an ObjectId reference — `entityId`
 * is an organization key and every other id is the paygate's.
 */

const str = { type: 'string' } as const
const optStr = { type: 'string', nullable: true } as const
const num = { type: 'number' } as const
const optNum = { type: 'number', nullable: true } as const
const optBool = { type: 'boolean', nullable: true } as const
const date = DateSchema
const optDate = { ...DateSchema, nullable: true }
const id = { type: 'string', nullable: true } as const

export const PaygateCustomerSchema = {
  type: 'object',
  properties: {
    id, paygate: str, externalId: str, entityId: optStr, profileId: optStr, email: optStr, name: optStr,
    taxId: optStr, deletedAt: optDate,
  },
  required: ['paygate', 'externalId'],
  additionalProperties: false,
} as unknown as JSONSchemaType<PaygateCustomerRecord>

export const PaymentSubscriptionSchema = {
  type: 'object',
  properties: {
    id, entityId: str, planSku: str, productSku: str, service: str, paygate: str, externalId: str,
    itemId: optStr, priceId: optStr, status: SubscriptionStatusSchema, externalStatus: optStr, rank: num,
    periodStart: optDate, periodEnd: optDate, cancelAtPeriodEnd: optBool, canceledAt: optDate,
    endedAt: optDate, pausedAt: optDate, trialEnd: optDate, latestInvoiceId: optStr, customerId: optStr,
    disputedAt: optDate, disputeStatus: optStr, createdAt: date, updatedAt: optDate, syncedAt: optDate,
    lastEventId: optStr, initialPropagatedAt: optDate,
    propagated: {
      type: 'object',
      nullable: true,
      properties: {
        planSku: str, rank: num, status: SubscriptionStatusSchema, cancelAtPeriodEnd: optBool,
        pausedAt: optDate, renewedInvoiceId: optStr,
      },
      required: ['planSku', 'rank', 'status'],
      additionalProperties: false,
    },
  },
  required: [
    'entityId', 'planSku', 'productSku', 'service', 'paygate', 'externalId', 'status', 'rank', 'createdAt',
  ],
  additionalProperties: false,
} as unknown as JSONSchemaType<PaymentSubscriptionRecord>

export const PaymentFulfillmentSchema = {
  type: 'object',
  properties: {
    id, entityId: str, productSku: str, planSku: optStr, service: str, paygate: str, externalId: str,
    paymentIntentId: optStr, chargeId: optStr, invoiceId: optStr, mode: CheckoutPricingModeSchema,
    units: optNum, amountMinor: optNum, sourceChargeAmountMinor: optNum, amountCurrency: optStr,
    chargeAmountMinor: optNum, currency: optStr, createdAt: date,
    fulfilledAt: optDate, failedAt: optDate, refundedMinor: optNum, refundedAt: optDate,
    disputedAt: optDate, disputeStatus: optStr,
  },
  required: ['entityId', 'productSku', 'service', 'paygate', 'externalId', 'mode', 'createdAt'],
  additionalProperties: false,
} as unknown as JSONSchemaType<PaymentFulfillmentRecord>

export const PaymentWebhookSchema = {
  type: 'object',
  properties: {
    id, paygate: str, service: str, url: str, externalId: str,
    /** The signing secret: field-encrypted when the database is configured with a key. */
    secret: { type: 'string', secure: true },
    apiVersion: str, events: { type: 'array', items: str }, hash: str, createdAt: date, updatedAt: optDate,
  },
  required: ['paygate', 'service', 'url', 'externalId', 'secret', 'apiVersion', 'events', 'hash', 'createdAt'],
  additionalProperties: false,
} as unknown as JSONSchemaType<PaymentWebhookRecord>

export const PaymentUsageSchema = {
  type: 'object',
  properties: {
    id, entityId: str, limitKey: str, window: str, delta: num, eventKey: str, ref: optStr, reason: optStr,
    planSku: optStr, createdAt: date, releasedAt: optDate,
  },
  required: ['entityId', 'limitKey', 'window', 'delta', 'eventKey', 'createdAt'],
  additionalProperties: false,
} as unknown as JSONSchemaType<PaymentUsageRecord>

export const PaymentUsageCounterSchema = {
  type: 'object',
  properties: {
    id, entityId: str, limitKey: str, window: str, used: num, limit: num, planSku: optStr,
    overSince: optDate, updatedAt: date, reconciledAt: optDate,
  },
  required: ['entityId', 'limitKey', 'window', 'used', 'limit', 'updatedAt'],
  additionalProperties: false,
} as unknown as JSONSchemaType<PaymentUsageCounterRecord>

export const FingerprintSchema = {
  type: 'object',
  properties: {
    id, sku: str, hash: str, productId: optStr, externalId: optStr, updatedAt: date,
  },
  required: ['sku', 'hash', 'updatedAt'],
  additionalProperties: false,
} as unknown as JSONSchemaType<FingerprintRecord>
