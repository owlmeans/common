import type { AuthorizationServerMetadata, ProtectedResourceMetadata } from '@owlmeans/oauth'
import type { OAuthUrlOption } from '../types.js'

/** The discovery documents and challenges of one context's authorization server. */
export interface OAuthMetadataHelper {
  /**
   * A hostname a Kubernetes secret mount populates is not necessarily readable yet at the moment
   * `appendOAuthServer` is called from `makeContext` — so every URL-shaped option is resolved HERE,
   * fresh on every call that needs it, rather than once at registration time. A plain string is
   * returned as-is; a function is called with the live context, the same way `makeSecurityHelper`
   * is used elsewhere in this platform to build a URL from `ctx.cfg.services[...]` at request time.
   */
  resolveOAuthUrl: (value: OAuthUrlOption) => string
  /** RFC 8414, this server's own metadata. There is exactly one authorization server per issuer
   * here, so nothing about this document varies by resource or by caller. */
  authorizationServerMetadata: () => AuthorizationServerMetadata
  /** The configured issuer, resolved and without a trailing slash. @throws {OAuthError} when unset */
  requireIssuer: () => string
  /** Whether `resource` (an authorization/device request's `resource` parameter) is one of THIS
   * server's own — resolved before comparing, since a declared entry may be a function. */
  isKnownResource: (resource: string) => boolean
  /** RFC 9728, for one resource this server issues tokens for — `resourcePath` is the same suffix
   * `OAUTH_PRM_PATH_PREFIX` was requested with, empty for the root resource. */
  protectedResourceMetadata: (resourcePath: string) => ProtectedResourceMetadata | null
  /**
   * The `WWW-Authenticate` challenge value a resource server answers a bare/rejected request with —
   * `viable`'s own `/mcp` handler and the ordinary REST API both call this rather than composing the
   * header by hand, so the two can never spell `resource_metadata` differently.
   */
  protectedResourceChallenge: (
    resourcePath: string, opts?: { error?: 'invalid_token' | 'insufficient_scope' }
  ) => string
}
