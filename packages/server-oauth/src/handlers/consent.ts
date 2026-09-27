import { AuthForbidden, AuthRole } from '@owlmeans/auth'
import { requireEntityKey } from '@owlmeans/auth-common'
import {
  createOpaqueSecret, hashOAuthSecret, hostOf, isLoopbackHost, OAuthAccessDenied,
  OAuthRequestExpired, OAuthRequestNotFound
} from '@owlmeans/oauth'
import type { ConsentView, OAuthEntrypoints } from '@owlmeans/oauth'
import { handlers } from '@owlmeans/server-api'
import { refuseTokenAuth } from '@owlmeans/server-auth-token'
import { resolveClient } from '../clients.js'
import { requireIssuer } from '../metadata.js'
import {
  createAuthorizationCode, deleteRequest, deleteUserCodeIndex, resolveRequestRef, saveRequest
} from '../pending.js'
import { mint } from './token.js'
import type { OAuthPendingRequestRecord, OAuthServerContext } from '../types.js'

const requirePending = async (
  context: OAuthServerContext, ref: string
): Promise<{ id: string, record: OAuthPendingRequestRecord }> => {
  const found = await resolveRequestRef(context, ref)
  if (found == null) throw new OAuthRequestNotFound(ref)
  if (found.record.expiresAt < Date.now()) throw new OAuthRequestExpired(ref)
  if (found.record.status !== 'pending') throw new OAuthRequestNotFound(ref)

  return found
}

export const loadConsent = (protocol: OAuthEntrypoints['load']) => handlers<OAuthServerContext>().params(protocol, async (payload, context) => {
  const { record } = await requirePending(context, payload.ref)
  const client = await resolveClient(context, record.clientId)

  const view: ConsentView = {
    ref: payload.ref,
    kind: record.kind,
    client: {
      name: client?.clientName ?? record.clientId,
      origin: record.clientOrigin,
      host: record.clientOrigin === 'cimd' ? (hostOf(record.clientId) ?? undefined) : undefined,
    },
    redirectHost: record.redirectUri != null ? (hostOf(record.redirectUri) ?? undefined) : undefined,
    localhostOnly: client != null && client.redirectUris.length > 0
      && client.redirectUris.every(uri => isLoopbackHost(hostOf(uri))),
    userCode: record.userCode,
    deviceName: record.deviceName,
    resource: record.resource,
    scopes: (record.scope ?? client?.scope ?? '*').split(' ').filter(scope => scope !== ''),
    expiresAt: new Date(record.expiresAt).toISOString(),
  }

  return view
})

export const approveConsent = (protocol: OAuthEntrypoints['approve']) => handlers<OAuthServerContext>().params(protocol, async (payload, context, req) => {
  refuseTokenAuth(req, 'oauth-approve')
  const { id, record } = await requirePending(context, payload.ref)

  const entityId = requireEntityKey(req)
  const profileId = req.auth?.profileId
  const userId = req.auth?.userId
  if (profileId == null || userId == null) throw new AuthForbidden('profile')
  const subject = {
    entityId, profileId, userId, role: req.auth?.role ?? AuthRole.User, scopes: req.auth?.scopes ?? [],
  }

  if (record.kind === 'device') {
    const client = await resolveClient(context, record.clientId)
    const outcome = await mint(context, subject, record.resource, {
      scope: client?.scope, clientName: client?.clientName, label: record.deviceName,
    })
    if (outcome.status !== 200 || !('access_token' in outcome.body)) {
      throw new OAuthAccessDenied('mint-failed')
    }
    await saveRequest(context, id, {
      ...record, status: 'approved',
      issuedToken: { accessToken: outcome.body.access_token, expiresIn: outcome.body.expires_in },
    })
    if (record.userCode != null) await deleteUserCodeIndex(context, record.userCode)

    return {}
  }

  // Code grant: mint nothing yet — the code is the artifact, and minting happens unauthenticated
  // at the token endpoint once PKCE and the redirect URI are re-checked there.
  const code = createOpaqueSecret()
  await createAuthorizationCode(context, hashOAuthSecret(code), {
    requestId: id, clientId: record.clientId, redirectUri: record.redirectUri!,
    codeChallenge: record.codeChallenge!, resource: record.resource, subject,
  })
  await deleteRequest(context, id)

  const redirect = new URL(record.redirectUri!)
  redirect.searchParams.set('code', code)
  if (record.state != null) redirect.searchParams.set('state', record.state)
  redirect.searchParams.set('iss', requireIssuer(context))

  return { redirect: redirect.toString() }
})

export const denyConsent = (protocol: OAuthEntrypoints['deny']) => handlers<OAuthServerContext>().params(protocol, async (payload, context, req) => {
  refuseTokenAuth(req, 'oauth-deny')
  const { id, record } = await requirePending(context, payload.ref)

  if (record.kind === 'device') {
    // Left for the poller to discover and clean up — that is the ONLY reader waiting on this
    // request, and it is what turns the client's next poll into `access_denied` rather than a
    // generic `invalid_grant` once the record is gone.
    await saveRequest(context, id, { ...record, status: 'denied' })

    return {}
  }

  await deleteRequest(context, id)
  const redirect = new URL(record.redirectUri!)
  redirect.searchParams.set('error', 'access_denied')
  if (record.state != null) redirect.searchParams.set('state', record.state)
  redirect.searchParams.set('iss', requireIssuer(context))

  return { redirect: redirect.toString() }
})
