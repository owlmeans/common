import {
  AUTHORIZATION_CODE_GRANT_TYPE, DEVICE_CODE_GRANT_TYPE, OAUTH_AUTHORIZE_PATH,
  OAUTH_DEVICE_AUTHORIZATION_PATH, OAUTH_PRM_PATH_PREFIX, OAUTH_REGISTER_PATH, OAUTH_REVOKE_PATH,
  OAUTH_TOKEN_AUTH_METHOD_NONE, OAUTH_TOKEN_PATH, PKCE_METHOD_S256
} from '@owlmeans/oauth'
import type { AuthorizationServerMetadata, ProtectedResourceMetadata } from '@owlmeans/oauth'
import { OAuthError } from '@owlmeans/oauth'
import type { OAuthServerContext, OAuthUrlOption } from './types.js'

/**
 * A hostname a Kubernetes secret mount populates is not necessarily readable yet at the moment
 * `appendOAuthServer` is called from `makeContext` — so every URL-shaped option is resolved HERE,
 * fresh on every call that needs it, rather than once at registration time. A plain string is
 * returned as-is; a function is called with the live context, the same way `makeSecurityHelper`
 * is used elsewhere in this platform to build a URL from `ctx.cfg.services[...]` at request time.
 */
export const resolveOAuthUrl = (context: OAuthServerContext, value: OAuthUrlOption): string =>
  typeof value === 'function' ? value(context) : value

/** RFC 8414, this server's own metadata. There is exactly one authorization server per issuer
 * here, so nothing about this document varies by resource or by caller. */
export const authorizationServerMetadata = (context: OAuthServerContext): AuthorizationServerMetadata => {
  const issuer = requireIssuer(context)
  const allowDcr = context.cfg.oauth?.allowDynamicRegistration !== false

  return {
    issuer,
    authorization_endpoint: `${issuer}${OAUTH_AUTHORIZE_PATH}`,
    token_endpoint: `${issuer}${OAUTH_TOKEN_PATH}`,
    device_authorization_endpoint: `${issuer}${OAUTH_DEVICE_AUTHORIZATION_PATH}`,
    revocation_endpoint: `${issuer}${OAUTH_REVOKE_PATH}`,
    ...(allowDcr ? { registration_endpoint: `${issuer}${OAUTH_REGISTER_PATH}` } : {}),
    scopes_supported: ['*'],
    response_types_supported: ['code'],
    grant_types_supported: [AUTHORIZATION_CODE_GRANT_TYPE, DEVICE_CODE_GRANT_TYPE],
    code_challenge_methods_supported: [PKCE_METHOD_S256],
    token_endpoint_auth_methods_supported: [OAUTH_TOKEN_AUTH_METHOD_NONE],
    client_id_metadata_document_supported: context.cfg.oauth?.allowClientIdMetadataDocuments !== false,
    authorization_response_iss_parameter_supported: true,
  }
}

export const requireIssuer = (context: OAuthServerContext): string => {
  const option = context.cfg.oauth?.issuer
  const issuer = option == null ? undefined : resolveOAuthUrl(context, option)
  if (issuer == null || issuer === '') throw new OAuthError('misconfigured:issuer')

  return issuer.replace(/\/$/, '')
}

const resourceConfigFor = (
  context: OAuthServerContext, resourcePath: string
): { resource: string, scopes?: string[] } | null => {
  const bare = resourcePath.replace(/^\/+/, '')
  const declared = context.cfg.oauth?.resources.find(
    resource => (resource.path ?? '').replace(/^\/+/, '') === bare
  )

  return declared == null ? null : { resource: resolveOAuthUrl(context, declared.resource), scopes: declared.scopes }
}

/** Whether `resource` (an authorization/device request's `resource` parameter) is one of THIS
 * server's own — resolved before comparing, since a declared entry may be a function. */
export const isKnownResource = (context: OAuthServerContext, resource: string): boolean =>
  context.cfg.oauth?.resources.some(declared => resolveOAuthUrl(context, declared.resource) === resource) ?? false

/** RFC 9728, for one resource this server issues tokens for — `resourcePath` is the same suffix
 * `OAUTH_PRM_PATH_PREFIX` was requested with, empty for the root resource. */
export const protectedResourceMetadata = (
  context: OAuthServerContext, resourcePath: string
): ProtectedResourceMetadata | null => {
  const resource = resourceConfigFor(context, resourcePath)
  if (resource == null) return null

  return {
    resource: resource.resource,
    authorization_servers: [requireIssuer(context)],
    ...(resource.scopes != null ? { scopes_supported: resource.scopes } : {}),
    bearer_methods_supported: ['header'],
  }
}

/**
 * The `WWW-Authenticate` challenge value a resource server answers a bare/rejected request with —
 * `viable`'s own `/mcp` handler and the ordinary REST API both call this rather than composing the
 * header by hand, so the two can never spell `resource_metadata` differently.
 */
export const protectedResourceChallenge = (
  context: OAuthServerContext, resourcePath: string, opts: { error?: 'invalid_token' | 'insufficient_scope' } = {}
): string => {
  const issuer = requireIssuer(context)
  const metadataUrl = `${issuer}${OAUTH_PRM_PATH_PREFIX}${resourcePath}`
  const params = [
    ...(opts.error != null ? [`error="${opts.error}"`] : []),
    `resource_metadata="${metadataUrl}"`,
  ]

  // RFC 6750 §3: the scheme and its first parameter are SPACE-separated; only parameters after
  // the first are comma-separated. `Bearer, resource_metadata=…` (a stray leading comma) is a
  // malformed challenge some clients silently fail to parse.
  return `Bearer ${params.join(', ')}`
}
