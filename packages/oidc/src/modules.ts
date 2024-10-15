import { body, filter, module } from '@owlmeans/module'
import { route, RouteMethod, backend } from '@owlmeans/route'
import { DISPATCHER_OIDC, DISPATCHER_OIDC_INIT } from './consts.js'
import { OIDCAuthInitParamsSchema, OIDCClientAuthPayloadSchema } from './models.js'

export const modules = [
  module(
    route(DISPATCHER_OIDC_INIT, '/authenticate/oidc/init', backend(null, RouteMethod.POST)),
    filter(body(OIDCAuthInitParamsSchema))
    
  ),
  module(
    route(DISPATCHER_OIDC, '/authenticate/oidc/process', backend(null, RouteMethod.POST)),
    filter(body(OIDCClientAuthPayloadSchema))
  )
]
