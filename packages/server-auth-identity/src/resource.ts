import { makeMongoResource } from '@owlmeans/mongo-resource'
import type { IdentityAccount, IdentityAccountResource, IdentityProfile, IdentityProfileResource, IdentityCredentials, IdentityCredentialsResource, OrgEntity, OrgEntityResource } from './types.js'
import {
  AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_PROFILE, AUTH_IDENTITY_CREDENTIALS, AUTH_IDENTITY_ORG_ENTITY,
  AUTH_IDENTITY_ACCOUNT_COLLECTION, AUTH_IDENTITY_PROFILE_COLLECTION, AUTH_IDENTITY_CREDENTIALS_COLLECTION,
  AUTH_IDENTITY_ORG_ENTITY_COLLECTION
} from './consts.js'

/**
 * The organization-entity registry.
 *
 * Both unique indexes are load-bearing. `slug` is what a rename writes, so the index is the only
 * thing standing between two organizations and the same public name; `iamKey` is quoted by systems
 * that were told it once and never asked again, so a duplicate there would silently hand one
 * organization another's realm. `formerSlugs` is indexed but NOT unique-scoped as a set — a retired
 * slug must stay findable, and uniqueness against it is enforced when a rename is applied.
 */
export const makeOrgEntityResource = (dbAlias?: string): OrgEntityResource => {
  const resource = makeMongoResource<OrgEntity, OrgEntityResource>(
    AUTH_IDENTITY_ORG_ENTITY, dbAlias, undefined, undefined, AUTH_IDENTITY_ORG_ENTITY_COLLECTION
  )
  resource.index('slug', { slug: 1 }, { unique: true })
  resource.index('iamKey', { iamKey: 1 }, { unique: true })
  resource.index('formerSlugs', { formerSlugs: 1 })
  return resource
}

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
  /**
   * The account's mongo id — the ONLY ObjectId reference in the identity trio.
   * `profileId` is a composite key (`"{type}:{accountId}"`), `entityId` is the Base58
   * slug, and `credentials.userId` is an external provider key — none of them converts.
   */
  resource.reference('userId', AUTH_IDENTITY_ACCOUNT)
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
