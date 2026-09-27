import { AUTH_TOKEN_RESOURCE } from '@owlmeans/auth-token'
import type { AccessTokenResource } from '@owlmeans/server-auth-token'
import { hashAccessToken } from '@owlmeans/server-auth-token'
import type { OAuthServerContext } from '../types.js'

/**
 * `POST /oauth/revoke` — RFC 7009. The response is the SAME whether the token existed, was
 * already revoked, or never belonged to this deployment at all (§2.2): a caller must not be able
 * to use this endpoint to probe which of those is true, and a token this holder no longer has any
 * other record of is exactly as safe to answer "done" about as one it just revoked.
 */
export const handleRevoke = async (context: OAuthServerContext, body: Record<string, string | undefined>): Promise<void> => {
  const token = body.token
  if (token == null || token === '') return

  const tokens = context.resource<AccessTokenResource>(AUTH_TOKEN_RESOURCE)
  const record = await tokens.load({ hash: hashAccessToken(token) })
  if (record == null || record.revokedAt != null) return

  await tokens.save({ ...record, revokedAt: new Date(), updatedAt: new Date() })
}
