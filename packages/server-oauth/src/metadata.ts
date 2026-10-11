import { memoHelper } from '@owlmeans/context'
import {
  AUTHORIZATION_CODE_GRANT_TYPE, DEVICE_CODE_GRANT_TYPE, OAUTH_AUTHORIZE_PATH,
  OAUTH_DEVICE_AUTHORIZATION_PATH, OAUTH_PRM_PATH_PREFIX, OAUTH_REGISTER_PATH, OAUTH_REVOKE_PATH,
  OAUTH_TOKEN_AUTH_METHOD_NONE, OAUTH_TOKEN_PATH, PKCE_METHOD_S256
} from '@owlmeans/oauth'
import type { AuthorizationServerMetadata, ProtectedResourceMetadata } from '@owlmeans/oauth'
import { OAuthError } from '@owlmeans/oauth'
import type { OAuthServerContext, OAuthUrlOption } from './types.js'
import type { OAuthMetadataHelper } from './metadata/types.js'

export const makeOAuthMetadataHelper = (context: OAuthServerContext): OAuthMetadataHelper => {
  const resolveOAuthUrl = (value: OAuthUrlOption): string =>
    typeof value === 'function' ? value(context) : value

  const authorizationServerMetadata = (): AuthorizationServerMetadata => {
    const issuer = requireIssuer()
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

  const requireIssuer = (): string => {
    const option = context.cfg.oauth?.issuer
    const issuer = option == null ? undefined : resolveOAuthUrl(option)
    if (issuer == null || issuer === '') throw new OAuthError('misconfigured:issuer')

    return issuer.replace(/\/$/, '')
  }

  const resourceConfigFor = (resourcePath: string): { resource: string, scopes?: string[] } | null => {
    const bare = resourcePath.replace(/^\/+/, '')
    const declared = context.cfg.oauth?.resources.find(
      resource => (resource.path ?? '').replace(/^\/+/, '') === bare
    )

    return declared == null ? null : { resource: resolveOAuthUrl(declared.resource), scopes: declared.scopes }
  }

  const isKnownResource = (resource: string): boolean =>
    context.cfg.oauth?.resources.some(declared => resolveOAuthUrl(declared.resource) === resource) ?? false

  const protectedResourceMetadata = (resourcePath: string): ProtectedResourceMetadata | null => {
    const resource = resourceConfigFor(resourcePath)
    if (resource == null) return null

    return {
      resource: resource.resource,
      authorization_servers: [requireIssuer()],
      ...(resource.scopes != null ? { scopes_supported: resource.scopes } : {}),
      bearer_methods_supported: ['header'],
    }
  }

  const protectedResourceChallenge = (
    resourcePath: string, opts: { error?: 'invalid_token' | 'insufficient_scope' } = {}
  ): string => {
    const issuer = requireIssuer()
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

  return {
    resolveOAuthUrl, authorizationServerMetadata, requireIssuer, isKnownResource, protectedResourceMetadata,
    protectedResourceChallenge,
  }
}

/** The metadata helper of a context — one per context. */
export const oauthMetadataOf = memoHelper.oncePer(makeOAuthMetadataHelper)

/** @deprecated compat:factory-refactor — use `oauthMetadataOf(ctx).authorizationServerMetadata()` */
export const authorizationServerMetadata = (context: OAuthServerContext): AuthorizationServerMetadata =>
  oauthMetadataOf(context).authorizationServerMetadata()

/** @deprecated compat:factory-refactor — use `oauthMetadataOf(ctx).isKnownResource(…)` */
export const isKnownResource = (context: OAuthServerContext, resource: string): boolean =>
  oauthMetadataOf(context).isKnownResource(resource)

/** @deprecated compat:factory-refactor — use `oauthMetadataOf(ctx).protectedResourceMetadata(…)` */
export const protectedResourceMetadata = (
  context: OAuthServerContext, resourcePath: string
): ProtectedResourceMetadata | null => oauthMetadataOf(context).protectedResourceMetadata(resourcePath)

/** @deprecated compat:factory-refactor — use `oauthMetadataOf(ctx).protectedResourceChallenge(…)` */
export const protectedResourceChallenge = (
  context: OAuthServerContext, resourcePath: string, opts: { error?: 'invalid_token' | 'insufficient_scope' } = {}
): string => oauthMetadataOf(context).protectedResourceChallenge(resourcePath, opts)
