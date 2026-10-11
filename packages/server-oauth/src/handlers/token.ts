import { AUTHORIZATION_CODE_GRANT_TYPE, DEVICE_CODE_GRANT_TYPE, oauthFormatHelper, pkceHelper, type OAuthTokenError } from '@owlmeans/oauth'
import { oauthClientsOf } from '../clients.js'
import { oauthMintOf } from '../mint.js'
import { oauthPendingOf } from '../pending.js'
import type { OAuthPendingRequestRecord, OAuthServerContext } from '../types.js'
import type { TokenOutcome, TokenRequestBody } from './types.js'

const err = (status: number, error: OAuthTokenError['error'], description?: string): TokenOutcome => ({
  status, body: { error, ...(description != null ? { error_description: description } : {}) },
})

/** `POST /oauth/token` — both grants this server supports, discriminated by `grant_type`. */
export const handleToken = async (context: OAuthServerContext, body: TokenRequestBody): Promise<TokenOutcome> => {
  switch (body.grant_type) {
    case AUTHORIZATION_CODE_GRANT_TYPE:
      return await handleAuthorizationCodeGrant(context, body)
    case DEVICE_CODE_GRANT_TYPE:
      return await handleDeviceCodeGrant(context, body)
    default:
      return err(400, 'unsupported_grant_type')
  }
}

const handleAuthorizationCodeGrant = async (context: OAuthServerContext, body: TokenRequestBody): Promise<TokenOutcome> => {
  const { code, redirect_uri: redirectUri, client_id: clientId, code_verifier: codeVerifier } = body
  if (code == null || redirectUri == null || clientId == null || codeVerifier == null) {
    return err(400, 'invalid_request')
  }

  const record = await oauthPendingOf(context).takeAuthorizationCode(oauthFormatHelper.hashOAuthSecret(code))
  // An unknown or already-consumed code answers exactly the same as a wrong one — a replay learns
  // nothing more than a first attempt with a made-up value would.
  if (record == null) return err(400, 'invalid_grant', 'code is unknown, expired, or already used')
  if (record.clientId !== clientId) return err(400, 'invalid_grant', 'client_id does not match the code')
  if (record.redirectUri !== redirectUri) return err(400, 'invalid_grant', 'redirect_uri does not match the original request')
  if (!pkceHelper.verifyPkce(codeVerifier, record.codeChallenge)) return err(400, 'invalid_grant', 'code_verifier does not match')

  const client = await oauthClientsOf(context).resolveClient(clientId)
  if (client == null) return err(400, 'invalid_client')
  if (!client.redirectUris.some(registered => oauthFormatHelper.matchesRedirectUri(registered, redirectUri))) {
    return err(400, 'invalid_grant', 'redirect_uri does not match this client\'s registration')
  }

  return await oauthMintOf(context).mint(record.subject, record.resource, {
    scope: client.scope, clientName: client.clientName, label: oauthFormatHelper.hostOf(redirectUri) ?? undefined,
  })
}

const handleDeviceCodeGrant = async (context: OAuthServerContext, body: TokenRequestBody): Promise<TokenOutcome> => {
  const { device_code: deviceCode, client_id: clientId } = body
  if (deviceCode == null || clientId == null) return err(400, 'invalid_request')

  const deviceCodeHash = oauthFormatHelper.hashOAuthSecret(deviceCode)
  const found = await oauthPendingOf(context).loadRequestByDeviceCodeHash(deviceCodeHash)
  if (found == null) return err(400, 'invalid_grant', 'device_code is unknown or expired')
  const { id, record } = found
  if (record.clientId !== clientId) return err(400, 'invalid_grant', 'client_id does not match the device code')
  if (record.expiresAt < Date.now()) {
    await forgetDeviceRequest(context, id, deviceCodeHash, record)

    return err(400, 'expired_token')
  }

  switch (record.status) {
    case 'pending':
      return err(400, 'authorization_pending')
    case 'denied':
      await forgetDeviceRequest(context, id, deviceCodeHash, record)

      return err(400, 'access_denied')
    case 'approved': {
      // The token was minted at the moment of approval (see the consent handler) and lives on the
      // request record for exactly one delivery — a redelivered poll after this point must never
      // hand out a second live token for the one approval that happened.
      await forgetDeviceRequest(context, id, deviceCodeHash, record)
      if (record.issuedToken == null) return err(400, 'authorization_pending')

      return {
        status: 200,
        body: { access_token: record.issuedToken.accessToken, token_type: 'Bearer', expires_in: record.issuedToken.expiresIn },
      }
    }
  }
}

const forgetDeviceRequest = async (
  context: OAuthServerContext, id: string, deviceCodeHash: string, record: OAuthPendingRequestRecord
): Promise<void> => {
  const pending = oauthPendingOf(context)
  await pending.deleteRequest(id)
  if (record.userCode != null) await pending.deleteUserCodeIndex(record.userCode)
  await pending.deleteDeviceCodeIndex(deviceCodeHash)
}
