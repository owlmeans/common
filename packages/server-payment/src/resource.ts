import type { ResourceMaker } from '@owlmeans/resource'
import { makeMongoResource } from '@owlmeans/mongo-resource'
import {
  RES_PAYGATE_CUSTOMER, RES_PAYMENT_FINGERPRINT, RES_PAYMENT_FULFILLMENT, RES_PAYMENT_SUBSCRIPTION,
  RES_PAYMENT_USAGE, RES_PAYMENT_USAGE_COUNTER, RES_PAYMENT_WEBHOOK,
} from './consts.js'
import {
  FingerprintSchema, PaygateCustomerSchema, PaymentFulfillmentSchema, PaymentSubscriptionSchema,
  PaymentUsageCounterSchema, PaymentUsageSchema, PaymentWebhookSchema,
} from './model.js'
import type {
  FingerprintRecord, FingerprintResource, PaygateCustomerRecord, PaygateCustomerResource,
  PaymentFulfillmentRecord, PaymentFulfillmentResource, PaymentSubscriptionRecord,
  PaymentSubscriptionResource, PaymentUsageCounterRecord, PaymentUsageCounterResource, PaymentUsageRecord,
  PaymentUsageResource, PaymentWebhookRecord, PaymentWebhookResource,
} from './types.js'

export const makePaygateCustomerResource: ResourceMaker<PaygateCustomerRecord, PaygateCustomerResource> = (
  dbAlias, serviceAlias,
) => {
  const resource = makeMongoResource<PaygateCustomerRecord, PaygateCustomerResource>(
    RES_PAYGATE_CUSTOMER, dbAlias, serviceAlias,
  )
  resource.loadByPgId = async (externalId, paygate) => await resource.load({ externalId, paygate })
  resource.byEntity = async (entityId, paygate) => await resource.load({ entityId, paygate })
  resource.schema = PaygateCustomerSchema
  resource.index('entity', { paygate: 1, entityId: 1 })
  resource.index('profile', { paygate: 1, profileId: 1 })
  resource.index('external', { paygate: 1, externalId: 1 }, { unique: true })
  return resource
}

export const makeSubscriptionResource: ResourceMaker<PaymentSubscriptionRecord, PaymentSubscriptionResource> = (
  dbAlias, serviceAlias,
) => {
  const resource = makeMongoResource<PaymentSubscriptionRecord, PaymentSubscriptionResource>(
    RES_PAYMENT_SUBSCRIPTION, dbAlias, serviceAlias,
  )
  resource.byExternalId = async (externalId, paygate) => await resource.load({ externalId, paygate })
  resource.byItemId = async (itemId, paygate) => await resource.load({ itemId, paygate })
  resource.schema = PaymentSubscriptionSchema
  resource.index('external', { paygate: 1, externalId: 1 }, { unique: true })
  resource.index('entityStatusRank', { entityId: 1, status: 1, rank: -1 })
  resource.index('entityPlan', { entityId: 1, planSku: 1 })
  resource.index('customer', { paygate: 1, customerId: 1 })
  resource.index('item', { paygate: 1, itemId: 1 }, { sparse: true })
  resource.index('statusUpdated', { paygate: 1, status: 1, updatedAt: 1 })
  return resource
}

export const makeFulfillmentResource: ResourceMaker<PaymentFulfillmentRecord, PaymentFulfillmentResource> = (
  dbAlias, serviceAlias,
) => {
  const resource = makeMongoResource<PaymentFulfillmentRecord, PaymentFulfillmentResource>(
    RES_PAYMENT_FULFILLMENT, dbAlias, serviceAlias,
  )
  resource.byExternalId = async (externalId, paygate) => await resource.load({ externalId, paygate })
  resource.schema = PaymentFulfillmentSchema
  resource.index('external', { paygate: 1, externalId: 1 }, { unique: true })
  resource.index('paymentIntent', { paygate: 1, paymentIntentId: 1 }, { sparse: true })
  resource.index('charge', { paygate: 1, chargeId: 1 }, { sparse: true })
  resource.index('entityCreated', { entityId: 1, createdAt: -1 })
  return resource
}

export const makeWebhookResource: ResourceMaker<PaymentWebhookRecord, PaymentWebhookResource> = (
  dbAlias, serviceAlias,
) => {
  const resource = makeMongoResource<PaymentWebhookRecord, PaymentWebhookResource>(
    RES_PAYMENT_WEBHOOK, dbAlias, serviceAlias,
  )
  resource.schema = PaymentWebhookSchema
  resource.index('endpoint', { paygate: 1, service: 1, url: 1 }, { unique: true })
  return resource
}

export const makeUsageResource: ResourceMaker<PaymentUsageRecord, PaymentUsageResource> = (
  dbAlias, serviceAlias,
) => {
  const resource = makeMongoResource<PaymentUsageRecord, PaymentUsageResource>(
    RES_PAYMENT_USAGE, dbAlias, serviceAlias,
  )
  resource.schema = PaymentUsageSchema
  resource.index('event', { entityId: 1, limitKey: 1, eventKey: 1 }, { unique: true })
  resource.index('window', { entityId: 1, limitKey: 1, window: 1 })
  resource.index('ref', { entityId: 1, limitKey: 1, ref: 1 }, { sparse: true })
  resource.index('entityCreated', { entityId: 1, createdAt: -1 })
  return resource
}

export const makeUsageCounterResource: ResourceMaker<PaymentUsageCounterRecord, PaymentUsageCounterResource> = (
  dbAlias, serviceAlias,
) => {
  const resource = makeMongoResource<PaymentUsageCounterRecord, PaymentUsageCounterResource>(
    RES_PAYMENT_USAGE_COUNTER, dbAlias, serviceAlias,
  )
  resource.schema = PaymentUsageCounterSchema
  resource.index('window', { entityId: 1, limitKey: 1, window: 1 }, { unique: true })
  return resource
}

export const makeFingerprintResource: ResourceMaker<FingerprintRecord, FingerprintResource> = (
  dbAlias, serviceAlias,
) => {
  const resource = makeMongoResource<FingerprintRecord, FingerprintResource>(
    RES_PAYMENT_FINGERPRINT, dbAlias, serviceAlias,
  )
  resource.bySku = async sku => await resource.load({ sku })
  resource.clear = async () => { await resource.purge({ sku: { $exists: true } }) }
  resource.schema = FingerprintSchema
  resource.index('sku', { sku: 1 }, { unique: true })
  return resource
}
