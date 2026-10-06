import { AuthForbidden } from '@owlmeans/auth'
import type { AccessTokenList, AuthTokenEntrypoints } from '@owlmeans/auth-token'
import { makeEntityScope } from '@owlmeans/auth-common'
import { handlers } from '@owlmeans/server-api'
import type { AuthTokenContext } from '../types.js'
import { tokenRecordUtils } from './utils.js'

export const listAccessTokens = (protocol: AuthTokenEntrypoints['list']) => handlers<AuthTokenContext>().request(protocol, async (req, context) => {
  const ctx = context as AuthTokenContext
  const entityId = makeEntityScope(req).requireEntityKey()
  const profileId = req.auth?.profileId
  if (profileId == null) throw new AuthForbidden('profile')

  const result = await tokenRecordUtils.tokens(ctx).list({ entityId, profileId }, { size: 0 })

  return {
    items: result.items
      .map(tokenRecordUtils.view)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  } satisfies AccessTokenList
})
