import { AuthForbidden } from '@owlmeans/auth'
import type { AuthTokenEntrypoints } from '@owlmeans/auth-token'
import { makeEntityScope } from '@owlmeans/auth-common'
import { handlers } from '@owlmeans/server-api'
import type { AuthTokenContext } from '../types.js'
import { refuseTokenAuth } from './refuse.js'
import { tokenRecordUtils } from './utils.js'

export const revokeAccessToken = (protocol: AuthTokenEntrypoints['revoke']) => handlers<AuthTokenContext>().params(protocol, async (payload, context, req) => {
  const ctx = context as AuthTokenContext
  refuseTokenAuth(req, 'token-revoke')

  const entityId = makeEntityScope(req).requireEntityKey()
  const profileId = req.auth?.profileId
  if (profileId == null) throw new AuthForbidden('profile')

  const record = await tokenRecordUtils.tokens(ctx).load(payload.id)
  // A token of another profile answers exactly as an unknown id does — an owner learns nothing
  // about tokens that are not theirs, not even that one exists.
  if (record == null || record.entityId !== entityId || record.profileId !== profileId) {
    throw new AuthForbidden('token')
  }

  // Idempotent: revoking twice is what a retry looks like.
  if (record.revokedAt == null) {
    await tokenRecordUtils.tokens(ctx).save({ ...record, revokedAt: new Date(), updatedAt: new Date() })
  }

  return { id: payload.id }
})
