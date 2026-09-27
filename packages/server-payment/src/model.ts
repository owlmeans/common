import type { JSONSchemaType } from 'ajv'
import { DateSchema } from '@owlmeans/auth'
import {
  CancellationKindSchema, CheckoutPricingModeSchema, ConsentKindSchema, ConsumerRegionSchema,
  DeclarationChannelSchema, DeclarationKindSchema, PurchaseKindSchema, SubscriptionStatusSchema,
} from '@owlmeans/payment'
import type {
  BillingProfileRecord, ConsumerConsentRecord, ConsumerDeclarationRecord, ConsumerEventRecord, FingerprintRecord,
  PaygateCustomerRecord, PaymentFulfillmentRecord, PaymentSubscriptionRecord, PaymentUsageCounterRecord,
  PaymentUsageRecord, PaymentWebhookRecord, PurchaseRecord,
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
    taxId: optStr, country: optStr, currency: optStr, deletedAt: optDate,
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
    lastEventId: optStr, initialPropagatedAt: optDate, currency: optStr,
    checkoutSessionId: optStr, purchaseId: optStr, firstInvoiceId: optStr, country: optStr, email: optStr,
    amountTotalMinor: optNum, amountTaxMinor: optNum, termsAccepted: optBool, startRequestId: optStr,
    withdrawnAt: optDate,
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
    country: optStr, email: optStr, profileId: optStr, amountTotalMinor: optNum, amountTaxMinor: optNum,
    termsAccepted: optBool, purchaseId: optStr,
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
    id, sku: str, hash: str, productId: optStr, externalId: optStr,
    prices: {
      type: 'array',
      nullable: true,
      items: {
        type: 'object',
        properties: {
          planSku: str, priceId: str, lookupKey: str, currency: str, unitAmount: num,
          // An array, never a currency-keyed map: the resource coerces a map's values to strings.
          options: {
            type: 'array',
            items: {
              type: 'object', properties: { currency: str, unitAmount: num },
              required: ['currency', 'unitAmount'], additionalProperties: false,
            },
          },
          taxBehavior: optStr, interval: optStr, sourceUnitAmount: num, sourceCurrency: str, syncedAt: date,
        },
        required: [
          'planSku', 'priceId', 'lookupKey', 'currency', 'unitAmount', 'options', 'sourceUnitAmount',
          'sourceCurrency', 'syncedAt',
        ],
        additionalProperties: false,
      },
    },
    updatedAt: date,
  },
  required: ['sku', 'hash', 'updatedAt'],
  additionalProperties: false,
} as unknown as JSONSchemaType<FingerprintRecord>

/** An optional enum: `null` must be listed for a validator to accept it. */
const nullableEnum = (values: readonly unknown[]) => ({ type: 'string', enum: [...values, null], nullable: true })

/** The request evidence every consumer act carries (`RequestOrigin`). */
const origin = {
  ip: optStr, forwardedFor: optStr, userAgent: optStr, ipCountry: optStr, acceptLanguage: optStr, via: optStr,
} as const

const links = {
  type: 'object',
  properties: {
    billingTerms: str, withdrawalInformation: optStr, withdrawalForm: optStr, withdrawalFunction: optStr,
    cancellation: optStr,
  },
  required: ['billingTerms'],
  additionalProperties: false,
} as const

export const BillingProfileSchema = {
  type: 'object',
  properties: {
    id, entityId: str, country: str, region: ConsumerRegionSchema, currency: str, language: str,
    source: { type: 'string', enum: ['checkout', 'customer', 'manual'] }, paygate: str, customerId: optStr,
    sessionId: optStr, ipCountry: optStr, email: optStr, name: optStr, business: optBool, lockedAt: date,
    createdAt: date, updatedAt: optDate,
  },
  required: ['entityId', 'country', 'region', 'currency', 'language', 'source', 'paygate', 'lockedAt', 'createdAt'],
  additionalProperties: false,
} as unknown as JSONSchemaType<BillingProfileRecord>

export const PurchaseSchema = {
  type: 'object',
  properties: {
    id, purchaseId: str, contractRef: str, entityId: str, kind: PurchaseKindSchema, paygate: str,
    sessionId: optStr, subscriptionId: optStr, paymentIntentId: optStr, invoiceId: optStr, invoiceNumber: optStr,
    invoiceLineId: optStr, productSku: str, planSku: optStr, profileId: optStr, country: optStr,
    region: nullableEnum(ConsumerRegionSchema.enum), ipCountry: optStr, inScope: { type: 'boolean' },
    language: str, email: optStr, name: optStr, business: optBool, currency: str, amountSubtotalMinor: num,
    amountTaxMinor: num, amountTotalMinor: num, presentmentCurrency: optStr, presentmentAmountMinor: optNum,
    netAmountMinor: optNum, amountCurrency: optStr, units: optNum, taxBehavior: optStr, termsAccepted: optBool,
    textVersion: optStr, copyVersion: optStr, startRequestId: optStr, servicesStartedAt: optDate,
    confirmationMailAt: optDate, purchasedAt: date, deadline: optDate, consentId: optStr, consentedAt: optDate,
    withdrawalId: optStr, withdrawnAt: optDate, refundedMinor: optNum, refundedAt: optDate, cancellationId: optStr,
    cancelEffectiveAt: optDate, createdAt: date, updatedAt: optDate,
  },
  required: [
    'purchaseId', 'contractRef', 'entityId', 'kind', 'paygate', 'productSku', 'inScope', 'language', 'currency',
    'amountSubtotalMinor', 'amountTaxMinor', 'amountTotalMinor', 'purchasedAt', 'createdAt',
  ],
  additionalProperties: false,
} as unknown as JSONSchemaType<PurchaseRecord>

export const ConsumerConsentSchema = {
  type: 'object',
  properties: {
    id, kind: ConsentKindSchema, entityId: str, profileId: optStr, name: optStr, email: optStr,
    purchaseIds: { type: 'array', items: str },
    planSku: optStr, planName: optStr, textVersion: str, copyVersion: str, language: str, uiLanguage: optStr, trader: str,
    text: {
      type: 'object',
      properties: { request: str, acknowledgement: str, checkbox: str },
      required: ['request', 'acknowledgement', 'checkbox'],
      additionalProperties: false,
    },
    links, deadline: optDate, decidedAt: date, expiresAt: optDate, ...origin,
  },
  required: [
    'kind', 'entityId', 'purchaseIds', 'textVersion', 'copyVersion', 'language', 'trader', 'text', 'links',
    'decidedAt',
  ],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConsumerConsentRecord>

export const ConsumerDeclarationSchema = {
  type: 'object',
  properties: {
    id, kind: DeclarationKindSchema, channel: DeclarationChannelSchema, entityId: optStr, purchaseId: optStr,
    subscriptionId: optStr, contractRef: optStr, name: str, email: str,
    cancellationKind: nullableEnum(CancellationKindSchema.enum), reason: optStr,
    effective: nullableEnum(['earliest', 'date']), requestedDate: optStr,
    language: str, textVersion: optStr, copyVersion: str, receivedAt: date, matched: { type: 'boolean' },
    profileId: optStr, duplicateOf: optStr, status: str, refundMinor: optNum, currency: optStr,
    effectiveAt: optDate, ...origin,
  },
  required: ['kind', 'channel', 'name', 'email', 'language', 'copyVersion', 'receivedAt', 'matched', 'status'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConsumerDeclarationRecord>

export const ConsumerEventSchema = {
  type: 'object',
  properties: {
    id, recordId: str,
    recordKind: { type: 'string', enum: ['purchase', 'consent', 'declaration', 'profile', 'checkout'] },
    entityId: optStr,
    action: {
      type: 'string',
      enum: [
        'mail', 'computed', 'meter', 'refund', 'credit-note', 'subscription-cancel', 'cancel-scheduled', 'observers',
        'lock', 'lock-mismatch', 'relock', 'unlock', 'duplicate', 'checkout-terms-fallback',
      ],
    },
    step: optStr, ok: { type: 'boolean' }, skipped: optBool, externalId: optStr, amountMinor: optNum,
    currency: optStr, detail: optStr, error: optStr, at: date,
  },
  required: ['recordId', 'recordKind', 'action', 'ok', 'at'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ConsumerEventRecord>
