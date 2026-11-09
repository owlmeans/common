import type { BasicContext } from '@owlmeans/context'
import { makeMongoResource } from '@owlmeans/mongo-resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import {
  EMAIL_AUTH_DEVICE_COLLECTION, EMAIL_AUTH_DEVICE_RESOURCE, EMAIL_AUTH_PASSWORD_COLLECTION, EMAIL_AUTH_PASSWORD_RESOURCE,
} from './consts.js'
import type { EmailDeviceRecord, EmailPasswordRecord } from './types.js'

/** One password record per account: the unique `accountId` index settles two first writes. */
export const makeEmailPasswordResource = (dbAlias?: string): MongoResource<EmailPasswordRecord> => {
  const resource = makeMongoResource<EmailPasswordRecord>(
    EMAIL_AUTH_PASSWORD_RESOURCE, dbAlias, undefined, EMAIL_AUTH_PASSWORD_COLLECTION
  )
  resource.index('account', { accountId: 1 }, { unique: true })

  return resource
}

/**
 * Remembered devices: unique per (account, device digest), and a genuine Mongo TTL index — the
 * server sweeps a record once its own `expiresAt` (a Date) has passed. Reads still filter
 * `expiresAt > now`, since the sweep runs about once a minute.
 */
export const makeEmailDeviceResource = (dbAlias?: string): MongoResource<EmailDeviceRecord> => {
  const resource = makeMongoResource<EmailDeviceRecord>(
    EMAIL_AUTH_DEVICE_RESOURCE, dbAlias, undefined, EMAIL_AUTH_DEVICE_COLLECTION
  )
  resource.index('device', { accountId: 1, key: 1 }, { unique: true })
  resource.index('expiry', { expiresAt: 1 }, { expireAfterSeconds: 0 })

  return resource
}

/**
 * Register the two Mongo resources of e-mail sign-in — usually against the identity store's db
 * config (`AUTH_IDENTITY_DB_ALIAS`), whose `resourcePrefix` then prefixes the collections too.
 */
export const appendEmailAuthResources = (context: BasicContext<any>, dbAlias?: string): void => {
  context.registerResource(makeEmailPasswordResource(dbAlias))
  context.registerResource(makeEmailDeviceResource(dbAlias))
}
