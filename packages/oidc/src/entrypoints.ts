import { body, filter, entrypoint } from '@owlmeans/entrypoint'
import { route, RouteMethod, backend } from '@owlmeans/route'
import { DISPATCHER_OIDC, DISPATCHER_OIDC_INIT } from './consts.js'
import { OIDCAuthInitParamsSchema, OIDCClientAuthPayloadSchema } from './models.js'

export const entrypoints = [
  entrypoint(
    route(DISPATCHER_OIDC_INIT, '/authenticate/oidc/init', backend(null, RouteMethod.POST)),
    filter(body(OIDCAuthInitParamsSchema))

  ),
  entrypoint(
    route(DISPATCHER_OIDC, '/authenticate/oidc/process', backend(null, RouteMethod.POST)),
    filter(body(OIDCClientAuthPayloadSchema))
  )
]
