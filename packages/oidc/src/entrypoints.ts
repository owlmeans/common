import { contract, protocol, typed } from '@owlmeans/entrypoint'
import { route, RouteMethod, backend } from '@owlmeans/route'
import type { AuthToken } from '@owlmeans/auth'
import {
  DISPATCHER_OIDC, DISPATCHER_OIDC_INIT, DISPATCHER_OIDC_ORGANIZATION, DISPATCHER_OIDC_ORGANIZATIONS, OIDC_GUARD,
} from './consts.js'
import { OIDCAuthInitParamsSchema, OIDCClientAuthPayloadSchema, OidcOrganizationSwitchSchema } from './schemas.js'
import type { OidcOrganizationList } from './types.js'

/** Shared OIDC browser-to-server protocols, bound by the relying-party packages. */
export const oidcProtocols = {
  init: protocol(
    route(DISPATCHER_OIDC_INIT, '/authenticate/oidc/init', backend(null, RouteMethod.POST)),
    contract.request({ body: typed(OIDCAuthInitParamsSchema) }, typed<any>()),
  ),
  authenticate: protocol(
    route(DISPATCHER_OIDC, '/authenticate/oidc/process', backend(null, RouteMethod.POST)),
    contract.request({ body: typed(OIDCClientAuthPayloadSchema) }, typed<any>()),
  ),
  // The organization switch acts on the session the wrapped token names, so only that token's own
  // guard can reach it — and it runs after the guard has refreshed the session against the
  // provider, so the list it answers from is the provider's current one.
  organizations: protocol(
    route(DISPATCHER_OIDC_ORGANIZATIONS, '/authenticate/oidc/organizations', backend(null, RouteMethod.GET)),
    contract(typed<OidcOrganizationList>()),
    { guards: OIDC_GUARD },
  ),
  organization: protocol(
    route(DISPATCHER_OIDC_ORGANIZATION, '/authenticate/oidc/organization', backend(null, RouteMethod.POST)),
    contract.request({ body: typed(OidcOrganizationSwitchSchema) }, typed<AuthToken>()),
    { guards: OIDC_GUARD },
  ),
}
