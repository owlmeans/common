import { contract, protocol, typed } from '@owlmeans/entrypoint'
import { route, RouteMethod, backend } from '@owlmeans/route'
import { DISPATCHER_OIDC, DISPATCHER_OIDC_INIT } from './consts.js'
import { OIDCAuthInitParamsSchema, OIDCClientAuthPayloadSchema } from './models.js'

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
}
