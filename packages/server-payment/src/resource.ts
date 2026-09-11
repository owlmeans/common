import type { ResourceMaker } from '@owlmeans/resource'
import { makeMongoResource } from '@owlmeans/mongo-resource'
import { RES_PAYGATE_CUSTOMER, RES_PAYMENT_FINGERPRINT, RES_PAYMENT_SUBSCRIPTION } from './consts.js'
import { FingerprintSchema, PaygateCustomerSchema, PaymentSubscriptionSchema } from './model.js'
import type {
  FingerprintRecord, FingerprintResource, PaygateCustomerRecord, PaygateCustomerResource,
  PaymentSubscriptionRecord, PaymentSubscriptionResource,
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
  resource.schema = PaymentSubscriptionSchema
  resource.index('entity', { entityId: 1 })
  resource.index('entitySku', { entityId: 1, sku: 1 })
  resource.index('external', { externalId: 1, paygate: 1 }, { unique: true })
  resource.index('status', { status: 1 })
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
