import { createStaticResource } from '@owlmeans/static-resource'
import { OAUTH_DEFAULT_TOKEN_TTL_SEC } from '@owlmeans/oauth'
import { makeOAuthDcrClientResource } from './clients.js'
import { OAUTH_DCR_RESOURCE, OAUTH_PENDING_RESOURCE } from './consts.js'
import { appendOAuthRoutes } from './route.js'
import type { OAuthServerContext, OAuthServerOptions } from './types.js'

/**
 * Wire the authorization server onto a context: write its configuration, register the resources
 * it needs (unless the application already registered its own — the same "an app that cares
 * provides its own; this is the working default" rule `AUTH_CACHE` follows), and mount the raw
 * endpoints.
 *
 * `opts.pendingResourceAlias`, if the application wants its short-lived requests/codes on Redis
 * rather than the in-process fallback this registers, must be registered by the application
 * BEFORE this call — exactly like `AUTH_CACHE`, a resource this package finds already there is
 * left alone.
 */
export const appendOAuthServer = (context: OAuthServerContext<any>, opts: OAuthServerOptions): void => {
  context.cfg.oauth = {
    tokenTtlSec: OAUTH_DEFAULT_TOKEN_TTL_SEC,
    ...opts,
    // The server's config reader replaces every string leaf that starts with `/` by the contents
    // of the FILE of that name (secrets are mounted that way) — so a resource path stored as
    // `/mcp` would crash the process at boot with ENOENT. It is kept without the slash and
    // compared without it (`resourceConfigFor`).
    resources: opts.resources.map(resource =>
      resource.path != null ? { ...resource, path: resource.path.replace(/^\/+/, '') } : resource
    ),
  }

  const pendingAlias = opts.pendingResourceAlias ?? OAUTH_PENDING_RESOURCE
  if (!context.hasResource(pendingAlias)) {
    context.registerResource(createStaticResource(pendingAlias))
  }

  if (opts.allowDynamicRegistration !== false && !context.hasResource(OAUTH_DCR_RESOURCE)) {
    context.registerResource(makeOAuthDcrClientResource(opts.dcrDbAlias))
  }

  appendOAuthRoutes(context)
}
