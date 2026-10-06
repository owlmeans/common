import { AuthForbidden, AuthRole } from '@owlmeans/auth'
import { oauthFormatHelper, OAuthAccessDenied } from '@owlmeans/oauth'
import type { OAuthEntrypoints } from '@owlmeans/oauth'
import { handlers } from '@owlmeans/server-api'
import { refuseTokenAuth } from '@owlmeans/server-auth-token'
import { oauthClientsOf } from '../../clients.js'
import { oauthMetadataOf } from '../../metadata.js'
import { oauthMintOf } from '../../mint.js'
import { oauthPendingOf } from '../../pending.js'
import type { OAuthServerContext } from '../../types.js'
import { makeEntityScope } from '@owlmeans/auth-common'

export const approveConsent = (protocol: OAuthEntrypoints['approve']) => handlers<OAuthServerContext>().params(protocol, async (payload, context, req) => {
  refuseTokenAuth(req, 'oauth-approve')
  const pending = oauthPendingOf(context)
  const { id, record } = await pending.requirePending(payload.ref)

  const entityId = makeEntityScope(req).requireEntityKey()
  const profileId = req.auth?.profileId
  const userId = req.auth?.userId
  if (profileId == null || userId == null) throw new AuthForbidden('profile')
  const subject = {
    entityId, profileId, userId, role: req.auth?.role ?? AuthRole.User, scopes: req.auth?.scopes ?? [],
  }

  if (record.kind === 'device') {
    const client = await oauthClientsOf(context).resolveClient(record.clientId)
    const outcome = await oauthMintOf(context).mint(subject, record.resource, {
      scope: client?.scope, clientName: client?.clientName, label: record.deviceName,
    })
    if (outcome.status !== 200 || !('access_token' in outcome.body)) {
      throw new OAuthAccessDenied('mint-failed')
    }
    await pending.saveRequest(id, {
      ...record, status: 'approved',
      issuedToken: { accessToken: outcome.body.access_token, expiresIn: outcome.body.expires_in },
    })
    if (record.userCode != null) await pending.deleteUserCodeIndex(record.userCode)

    return {}
  }

  // Code grant: mint nothing yet — the code is the artifact, and minting happens unauthenticated
  // at the token endpoint once PKCE and the redirect URI are re-checked there.
  const code = oauthFormatHelper.createOpaqueSecret()
  await pending.createAuthorizationCode(oauthFormatHelper.hashOAuthSecret(code), {
    requestId: id, clientId: record.clientId, redirectUri: record.redirectUri!,
    codeChallenge: record.codeChallenge!, resource: record.resource, subject,
  })
  await pending.deleteRequest(id)

  const redirect = new URL(record.redirectUri!)
  redirect.searchParams.set('code', code)
  if (record.state != null) redirect.searchParams.set('state', record.state)
  redirect.searchParams.set('iss', oauthMetadataOf(context).requireIssuer())

  return { redirect: redirect.toString() }
})
