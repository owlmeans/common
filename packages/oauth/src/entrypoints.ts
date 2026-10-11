import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import { frontend, route, RouteMethod } from '@owlmeans/route'
import { oauth, OAUTH_CONSENT_PATH, OAUTH_DEVICE_PATH, OAUTH_DONE_PATH } from './consts.js'
import { ConsentParamsSchema } from './schemas.js'
import type {
  ConsentDecisionResult, ConsentParams, ConsentView, OAuthEntrypointOptions, OAuthEntrypoints
} from './types.js'

/**
 * The session-guarded half of the consent surface: load a pending request and approve or deny it.
 *
 * Ordinary entrypoints, mounted under whatever guarded parent the application chooses — an
 * account section, so the ownership gate that already protects a person's own settings protects
 * the power to mint a token on their behalf too. A base with a parent inherits its guard and
 * gate; a base without one carries `opts.guard`. The application MUST also list `approve`/`deny`
 * (and, if it mints elsewhere, `load`) in its access-token deny list — a token must never be able
 * to approve the minting of another token (`@owlmeans/server-auth-token`'s `denyAliases`).
 */
export const makeOAuthProtocols = (opts: OAuthEntrypointOptions = {}): OAuthEntrypoints => {
  const path = opts.path ?? '/oauth-consent'
  const base = opts.parent != null
    ? openProtocol(route(oauth.base, path, { parent: opts.parent }))
    : openProtocol(route(oauth.base, path), opts.guard == null ? undefined : { guards: opts.guard })

  return {
    base,
    load: protocol(
      route(oauth.load, '/:ref', { parent: oauth.base, method: RouteMethod.GET }),
      contract.request({ params: typed<ConsentParams>(ConsentParamsSchema) }, typed<ConsentView>())
    ),
    approve: protocol(
      route(oauth.approve, '/:ref/approve', { parent: oauth.base, method: RouteMethod.POST }),
      contract.request({ params: typed<ConsentParams>(ConsentParamsSchema) }, typed<ConsentDecisionResult>())
    ),
    deny: protocol(
      route(oauth.deny, '/:ref/deny', { parent: oauth.base, method: RouteMethod.POST }),
      contract.request({ params: typed<ConsentParams>(ConsentParamsSchema) }, typed<ConsentDecisionResult>())
    ),
    // The three screens are top-level frontend routes with no parent, `sticky` so the router
    // keeps them regardless of `cfg.service` filtering, and no `service` override — unlike
    // `DISPATCHER`, these are ordinary in-app screens: a person can arrive at one directly (the
    // MCP opens a browser straight at it) or be sent to one in-app after returning from sign-in
    // (`@owlmeans/client-flow`'s `resumeSuspendedFlow`), and the second case should be a normal
    // SPA navigation, not a redundant full reload. `@owlmeans/web-oauth` binds these three to
    // components; here they are only addresses.
    consentScreen: openProtocol(route(oauth.consentScreen, OAUTH_CONSENT_PATH, frontend()), { sticky: true }),
    deviceScreen: openProtocol(route(oauth.deviceScreen, OAUTH_DEVICE_PATH, frontend()), { sticky: true }),
    doneScreen: openProtocol(route(oauth.doneScreen, OAUTH_DONE_PATH, frontend()), { sticky: true }),
  }
}
