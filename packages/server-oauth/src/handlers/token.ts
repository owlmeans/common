import {
  AUTHORIZATION_CODE_GRANT_TYPE, DEVICE_CODE_GRANT_TYPE, hashOAuthSecret, hostOf, matchesRedirectUri,
  verifyPkce
} from '@owlmeans/oauth'
import { AUTH_TOKEN_NAME_MAX } from '@owlmeans/auth-token'
import type { OAuthTokenError, OAuthTokenResponse } from '@owlmeans/oauth'
import { issueAccessToken } from '@owlmeans/server-auth-token'
import type { IssueAccessTokenSubject } from '@owlmeans/server-auth-token'
import { resolveClient } from '../clients.js'
import {
  deleteDeviceCodeIndex, deleteRequest, deleteUserCodeIndex, loadRequestByDeviceCodeHash,
  takeAuthorizationCode
} from '../pending.js'
import type { OAuthPendingRequestRecord, OAuthServerContext } from '../types.js'

export interface TokenOutcome {
  status: number
  body: OAuthTokenResponse
}

/** A form-encoded body, read as plain strings — a token request is never trusted to already be
 * shaped like `OAuthTokenRequest` just because a client claims a `grant_type`. */
export type TokenRequestBody = Record<string, string | undefined>

const err = (status: number, error: OAuthTokenError['error'], description?: string): TokenOutcome => ({
  status, body: { error, ...(description != null ? { error_description: description } : {}) },
})

const audienceFor = (resource: string | undefined): string[] | undefined => resource == null ? undefined : [resource]

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

  const record = await takeAuthorizationCode(context, hashOAuthSecret(code))
  // An unknown or already-consumed code answers exactly the same as a wrong one — a replay learns
  // nothing more than a first attempt with a made-up value would.
  if (record == null) return err(400, 'invalid_grant', 'code is unknown, expired, or already used')
  if (record.clientId !== clientId) return err(400, 'invalid_grant', 'client_id does not match the code')
  if (record.redirectUri !== redirectUri) return err(400, 'invalid_grant', 'redirect_uri does not match the original request')
  if (!verifyPkce(codeVerifier, record.codeChallenge)) return err(400, 'invalid_grant', 'code_verifier does not match')

  const client = await resolveClient(context, clientId)
  if (client == null) return err(400, 'invalid_client')
  if (!client.redirectUris.some(registered => matchesRedirectUri(registered, redirectUri))) {
    return err(400, 'invalid_grant', 'redirect_uri does not match this client\'s registration')
  }

  return await mint(context, record.subject, record.resource, {
    scope: client.scope, clientName: client.clientName, label: hostOf(redirectUri) ?? undefined,
  })
}

const handleDeviceCodeGrant = async (context: OAuthServerContext, body: TokenRequestBody): Promise<TokenOutcome> => {
  const { device_code: deviceCode, client_id: clientId } = body
  if (deviceCode == null || clientId == null) return err(400, 'invalid_request')

  const deviceCodeHash = hashOAuthSecret(deviceCode)
  const found = await loadRequestByDeviceCodeHash(context, deviceCodeHash)
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
  await deleteRequest(context, id)
  if (record.userCode != null) await deleteUserCodeIndex(context, record.userCode)
  await deleteDeviceCodeIndex(context, deviceCodeHash)
}

/** What a token's name is made of — the client, and where it is running. */
export interface MintMeta {
  scope?: string
  clientName?: string
  /** The device name (device grant) or the redirect host (code grant). */
  label?: string
}

/**
 * The name the token has in the person's own token list — "Viable MCP · my-laptop". It is the ONLY
 * thing that tells one connector's token from another when it is time to revoke one, so it names
 * the client and the place it runs rather than the protocol that issued it.
 */
export const tokenNameOf = (meta: MintMeta): string => {
  const name = [meta.clientName, meta.label]
    .filter((part): part is string => part != null && part.trim() !== '')
    .map(part => part.trim())
    .join(' · ')

  return (name === '' ? 'OAuth connector' : name).slice(0, AUTH_TOKEN_NAME_MAX)
}

/**
 * Mint an access token for an approved request — shared by the code grant (here, once PKCE and
 * the redirect URI have been re-checked) and the device grant's consent-approval handler (which
 * mints immediately, since that request never comes back here unauthenticated).
 */
export const mint = async (
  context: OAuthServerContext, subject: IssueAccessTokenSubject,
  resource: string | undefined, meta: MintMeta
): Promise<TokenOutcome> => {
  const ttlSec = context.cfg.oauth?.tokenTtlSec
  const clientScope = meta.scope
  const issued = await issueAccessToken(context, subject, {
    name: tokenNameOf(meta),
    audience: audienceFor(resource),
    expiresIn: ttlSec,
  })

  return {
    status: 200,
    body: { access_token: issued.token, token_type: 'Bearer', expires_in: ttlSec, ...(clientScope != null ? { scope: clientScope } : {}) },
  }
}

export { audienceFor }
