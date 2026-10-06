import { AuthForbidden, AuthRole } from '@owlmeans/auth'
import type { AuthTokenEntrypoints } from '@owlmeans/auth-token'
import { makeEntityScope } from '@owlmeans/auth-common'
import { handlers } from '@owlmeans/server-api'
import type { AuthTokenContext } from '../types.js'
import { accessTokenIssuerOf } from './issue.js'
import { refuseTokenAuth } from './refuse.js'

export const createAccessToken = (protocol: AuthTokenEntrypoints['create']) => handlers<AuthTokenContext>().body(protocol, async (payload, context, req) => {
  const ctx = context as AuthTokenContext
  refuseTokenAuth(req, 'token-mint')

  const entityId = makeEntityScope(req).requireEntityKey()
  const profileId = req.auth?.profileId
  const userId = req.auth?.userId
  if (profileId == null || userId == null) throw new AuthForbidden('profile')

  return accessTokenIssuerOf(ctx).issueAccessToken({
    entityId, profileId, userId, role: req.auth?.role ?? AuthRole.User, scopes: req.auth?.scopes ?? [],
  }, payload)
})
