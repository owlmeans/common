import { makeMongoResource, type MongoResource } from '@owlmeans/mongo-resource'
import { OAUTH_DCR_COLLECTION, OAUTH_DCR_RESOURCE } from './consts.js'
import type { OAuthDcrClientRecord } from './types.js'

export const makeOAuthDcrClientResource = (dbAlias?: string): MongoResource<OAuthDcrClientRecord> => {
  const resource = makeMongoResource<OAuthDcrClientRecord>(OAUTH_DCR_RESOURCE, dbAlias, undefined, OAUTH_DCR_COLLECTION)
  resource.index('client', { clientId: 1 }, { unique: true })
  // A genuine Mongo TTL index: the driver sweeps a record once its own `expiresAt` has passed,
  // so a client that registered and never returned to exchange a code is forgotten without a job.
  resource.index('expiry', { expiresAt: 1 }, { expireAfterSeconds: 0 })

  return resource
}
