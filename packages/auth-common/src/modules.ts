
import {
  AUTHEN, AUTHEN_AUTHEN, AUTHEN_INIT, AllowanceRequestSchema, AuthCredentialsSchema,
  AuthTokenSchema, CAUTHEN, CAUTHEN_AUTHEN, DISPATCHER, DISPATCHER_AUTHEN
} from '@owlmeans/auth'
import { body, filter, module, query } from '@owlmeans/module'
import { route, RouteMethod, frontend } from '@owlmeans/route'

export const modules = [
  module(route(AUTHEN, '/authentication')),
  module(route(AUTHEN_INIT, '/init', { parent: AUTHEN, method: RouteMethod.POST }), filter(body(AllowanceRequestSchema))),
  module(route(AUTHEN_AUTHEN, '/authenticate', { parent: AUTHEN, method: RouteMethod.POST }), filter(body(AuthCredentialsSchema))),
  module(route(CAUTHEN, '/authentication', frontend())),
  module(route(CAUTHEN_AUTHEN, '/login', frontend(CAUTHEN))),
  module(
    route(DISPATCHER, '/dispatcher', frontend({ service: DISPATCHER })),
    // This module is sticky - it means it's always attach to client router.
    // It's requred here cause every web app needs dispatcher route to authorize
    // rediected users.
    filter(query(AuthTokenSchema), { sticky: true })
  ),
  module(route(DISPATCHER_AUTHEN, '/authentication', { method: RouteMethod.POST }), filter(body(AuthTokenSchema)))
]
