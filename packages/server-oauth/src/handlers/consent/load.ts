import { oauthFormatHelper } from '@owlmeans/oauth'
import type { ConsentView, OAuthEntrypoints } from '@owlmeans/oauth'
import { handlers } from '@owlmeans/server-api'
import { oauthClientsOf } from '../../clients.js'
import { oauthPendingOf } from '../../pending.js'
import type { OAuthServerContext } from '../../types.js'

export const loadConsent = (protocol: OAuthEntrypoints['load']) => handlers<OAuthServerContext>().params(protocol, async (payload, context) => {
  const { record } = await oauthPendingOf(context).requirePending(payload.ref)
  const client = await oauthClientsOf(context).resolveClient(record.clientId)
  const { hostOf, isLoopbackHost } = oauthFormatHelper

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
