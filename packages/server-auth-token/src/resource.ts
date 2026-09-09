import { AUTH_TOKEN_COLLECTION, AUTH_TOKEN_RESOURCE } from '@owlmeans/auth-token'
import type { AccessTokenRecord } from '@owlmeans/auth-token'
import { makeMongoResource } from '@owlmeans/mongo-resource'
import type { AccessTokenResource } from './types.js'

/**
 * Where access tokens live.
 *
 * `entityId` and `profileId` are stored as plain strings and only indexed — never declared as
 * ObjectId references — because that is how the identity records they point at store them, and a
 * reference declared on one side of a join and not the other finds nothing.
 *
 * No `$jsonSchema` is applied. The write path is one handler with a validated body, and a schema
 * on the collection would have to be kept in step with a record the guard writes to on every
 * request (`lastUsedAt`) for no protection the handler does not already give.
 */
export const makeAccessTokenResource = (dbAlias?: string): AccessTokenResource => {
  const resource = makeMongoResource<AccessTokenRecord, AccessTokenResource>(
    AUTH_TOKEN_RESOURCE, dbAlias, undefined, AUTH_TOKEN_COLLECTION
  )
  // The lookup every authenticated request makes. Unique because two records answering one
  // presented secret would make revocation a coin toss.
  resource.index('hash', { hash: 1 }, { unique: true })
  resource.index('owner', { entityId: 1, profileId: 1 })
  resource.index('expiresAt', { expiresAt: 1 }, { sparse: true })

  return resource
}
