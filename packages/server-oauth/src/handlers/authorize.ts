import {
  createIdOfLength, IdStyle
} from '@owlmeans/basic-ids'
import {
  matchesRedirectUri, OAUTH_REQUEST_TTL_SEC, PKCE_METHOD_S256
} from '@owlmeans/oauth'
import type { AuthorizeQuery } from '@owlmeans/oauth'
import { createRequest } from '../pending.js'
import { resolveClient } from '../clients.js'
import { isKnownResource, requireIssuer, resolveOAuthUrl } from '../metadata.js'
import type { OAuthServerContext } from '../types.js'

export type AuthorizeOutcome =
  // The client or its redirect URI could not be trusted — nothing is redirected to, ever.
  | { kind: 'refused', status: number, message: string }
  // Client and redirect URI check out; everything else wrong is safe to report AT the redirect.
  | { kind: 'redirect', location: string }
  | { kind: 'to-consent', location: string }

const errorRedirect = (
  redirectUri: string, error: string, state: string | undefined, issuer: string
): AuthorizeOutcome => {
  const url = new URL(redirectUri)
  url.searchParams.set('error', error)
  if (state != null) url.searchParams.set('state', state)
  url.searchParams.set('iss', issuer)

  return { kind: 'redirect', location: url.toString() }
}

/**
 * `GET /oauth/authorize` — the code grant's front door.
 *
 * Every check up to and including the redirect URI match happens BEFORE anything is trusted
 * enough to redirect to: an attacker who controls `client_id` or `redirect_uri` alone must not be
 * able to make this endpoint bounce a browser anywhere of their choosing. Once the pair is
 * verified against the client's own registration, later mistakes (a missing PKCE parameter, an
 * unknown resource) are reported back to that SAME verified redirect URI, which is the ordinary
 * OAuth error-handling shape a client already expects.
 */
export const handleAuthorize = async (
  context: OAuthServerContext, query: Partial<AuthorizeQuery>
): Promise<AuthorizeOutcome> => {
  if (query.client_id == null || query.client_id === '') {
    return { kind: 'refused', status: 400, message: 'client_id is required' }
  }

  const client = await resolveClient(context, query.client_id)
  if (client == null) {
    return { kind: 'refused', status: 400, message: 'Unknown client' }
  }

  if (query.redirect_uri == null || !client.redirectUris.some(registered => matchesRedirectUri(registered, query.redirect_uri!))) {
    return { kind: 'refused', status: 400, message: 'redirect_uri does not match this client\'s registration' }
  }

  const issuer = requireIssuer(context)
  const redirectUri = query.redirect_uri

  if (query.response_type !== 'code') {
    return errorRedirect(redirectUri, 'unsupported_response_type', query.state, issuer)
  }
  if (query.code_challenge_method !== PKCE_METHOD_S256 || query.code_challenge == null || query.code_challenge === '') {
    return errorRedirect(redirectUri, 'invalid_request', query.state, issuer)
  }
  if (query.resource != null && !isKnownResource(context, query.resource)) {
    return errorRedirect(redirectUri, 'invalid_target', query.state, issuer)
  }

  const id = createIdOfLength(24, IdStyle.Base58)
  const now = Date.now()
  await createRequest(context, id, {
    kind: 'code',
    clientId: client.clientId,
    clientOrigin: client.origin,
    scope: query.scope,
    resource: query.resource,
    redirectUri,
    state: query.state,
    codeChallenge: query.code_challenge,
    status: 'pending',
    createdAt: now,
    expiresAt: now + OAUTH_REQUEST_TTL_SEC * 1000,
  })

  const consent = new URL(resolveOAuthUrl(context, context.cfg.oauth!.consentUrl))
  consent.searchParams.set('ref', id)

  return { kind: 'to-consent', location: consent.toString() }
}
