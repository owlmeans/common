import { createIdOfLength, IdStyle } from '@owlmeans/basic-ids'
import {
  createDeviceCode, createUserCode, hashDeviceCode, OAUTH_DEVICE_NAME_MAX,
  OAUTH_DEVICE_POLL_INTERVAL_SEC, OAUTH_REQUEST_TTL_SEC
} from '@owlmeans/oauth'
import type { DeviceAuthorizationRequest, DeviceAuthorizationResponse, OAuthTokenError } from '@owlmeans/oauth'
import { createDeviceCodeIndex, createRequest, createUserCodeIndex } from '../pending.js'
import { resolveClient } from '../clients.js'
import { isKnownResource, resolveOAuthUrl } from '../metadata.js'
import type { OAuthServerContext } from '../types.js'

export type DeviceAuthorizationOutcome =
  | { status: 200, body: DeviceAuthorizationResponse }
  | { status: 400, body: OAuthTokenError }

/** `POST /oauth/device_authorization` — RFC 8628 §3.1/3.2. */
export const handleDeviceAuthorization = async (
  context: OAuthServerContext, body: Partial<DeviceAuthorizationRequest>
): Promise<DeviceAuthorizationOutcome> => {
  if (body.client_id == null || body.client_id === '') {
    return { status: 400, body: { error: 'invalid_request', error_description: 'client_id is required' } }
  }
  const client = await resolveClient(context, body.client_id)
  if (client == null) {
    return { status: 400, body: { error: 'invalid_client' } }
  }
  if (body.resource != null && !isKnownResource(context, body.resource)) {
    return { status: 400, body: { error: 'invalid_target' } }
  }

  const id = createIdOfLength(24, IdStyle.Base58)
  const deviceCode = createDeviceCode()
  const userCode = createUserCode()
  const now = Date.now()
  const expiresAt = now + OAUTH_REQUEST_TTL_SEC * 1000

  await createRequest(context, id, {
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
  await createUserCodeIndex(context, userCode, id, expiresAt)
  await createDeviceCodeIndex(context, hashDeviceCode(deviceCode), id, expiresAt)

  const verificationUri = resolveOAuthUrl(context, context.cfg.oauth!.deviceUrl)
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
