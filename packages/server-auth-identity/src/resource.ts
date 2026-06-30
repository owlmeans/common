import { makeMongoResource } from '@owlmeans/mongo-resource'
import type { IdentityAccount, IdentityAccountResource, IdentityProfile, IdentityProfileResource, IdentityCredentials, IdentityCredentialsResource } from './types.js'
import {
  AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_PROFILE, AUTH_IDENTITY_CREDENTIALS,
  AUTH_IDENTITY_ACCOUNT_COLLECTION, AUTH_IDENTITY_PROFILE_COLLECTION, AUTH_IDENTITY_CREDENTIALS_COLLECTION
} from './consts.js'

export const makeIdentityAccountResource = (dbAlias?: string): IdentityAccountResource => {
  const resource = makeMongoResource<IdentityAccount, IdentityAccountResource>(
    AUTH_IDENTITY_ACCOUNT, dbAlias, undefined, undefined, AUTH_IDENTITY_ACCOUNT_COLLECTION
  )
  resource.index('credential', { credential: 1 }, { unique: true })
  resource.index('entityId', { entityId: 1 })
  resource.index('secret', { secret: 1 }, { unique: true, sparse: true })
  return resource
}

export const makeIdentityProfileResource = (dbAlias?: string): IdentityProfileResource => {
  const resource = makeMongoResource<IdentityProfile, IdentityProfileResource>(
    AUTH_IDENTITY_PROFILE, dbAlias, undefined, undefined, AUTH_IDENTITY_PROFILE_COLLECTION
  )
  resource.index('userId', { userId: 1 })
  resource.index('entityId', { entityId: 1 })
  resource.index('role', { role: 1, entityId: 1 })
  resource.index('profile', { profileId: 1, entityId: 1 }, { unique: true })
  return resource
}

export const makeIdentityCredentialsResource = (dbAlias?: string): IdentityCredentialsResource => {
  const resource = makeMongoResource<IdentityCredentials, IdentityCredentialsResource>(
    AUTH_IDENTITY_CREDENTIALS, dbAlias, undefined, undefined, AUTH_IDENTITY_CREDENTIALS_COLLECTION
  )
  resource.index('provider', { type: 1, userId: 1, credential: 1 }, { unique: true })
  resource.index('profileId', { profileId: 1 })
  return resource
}
