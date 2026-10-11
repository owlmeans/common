import { createIdOfLength, IdStyle } from '@owlmeans/basic-ids'
import { oauthFormatHelper, OAUTH_DEVICE_NAME_MAX, OAUTH_DEVICE_POLL_INTERVAL_SEC, OAUTH_REQUEST_TTL_SEC, type DeviceAuthorizationRequest } from '@owlmeans/oauth'
import { oauthPendingOf } from '../pending.js'
import { oauthClientsOf } from '../clients.js'
import { oauthMetadataOf } from '../metadata.js'
import type { OAuthServerContext } from '../types.js'
import type { DeviceAuthorizationOutcome } from './types.js'

/** `POST /oauth/device_authorization` — RFC 8628 §3.1/3.2. */
export const handleDeviceAuthorization = async (
  context: OAuthServerContext, body: Partial<DeviceAuthorizationRequest>
): Promise<DeviceAuthorizationOutcome> => {
  if (body.client_id == null || body.client_id === '') {
    return { status: 400, body: { error: 'invalid_request', error_description: 'client_id is required' } }
  }
  const metadata = oauthMetadataOf(context)
  const client = await oauthClientsOf(context).resolveClient(body.client_id)
  if (client == null) {
    return { status: 400, body: { error: 'invalid_client' } }
  }
  if (body.resource != null && !metadata.isKnownResource(body.resource)) {
    return { status: 400, body: { error: 'invalid_target' } }
  }

  const id = createIdOfLength(24, IdStyle.Base58)
  const deviceCode = oauthFormatHelper.createDeviceCode()
  const userCode = oauthFormatHelper.createUserCode()
  const now = Date.now()
  const expiresAt = now + OAUTH_REQUEST_TTL_SEC * 1000

  const pending = oauthPendingOf(context)
  await pending.createRequest(id, {
    kind: 'device',
    clientId: client.clientId,
    clientOrigin: client.origin,
    scope: body.scope,
    resource: body.resource,
    deviceName: body.device_name?.slice(0, OAUTH_DEVICE_NAME_MAX),
    userCode,
    status: 'pending',
    createdAt: now,
    expiresAt,
  })
  await pending.createUserCodeIndex(userCode, id, expiresAt)
  await pending.createDeviceCodeIndex(oauthFormatHelper.hashDeviceCode(deviceCode), id, expiresAt)

  const verificationUri = metadata.resolveOAuthUrl(context.cfg.oauth!.deviceUrl)
  const complete = new URL(verificationUri)
  complete.searchParams.set('user_code', userCode)

  return {
    status: 200,
    body: {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: verificationUri,
      verification_uri_complete: complete.toString(),
      expires_in: OAUTH_REQUEST_TTL_SEC,
      interval: OAUTH_DEVICE_POLL_INTERVAL_SEC,
    },
  }
}
