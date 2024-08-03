
import {
  AUTHEN, AUTHEN_AUTHEN, AUTHEN_INIT, AUTHEN_RELY, AllowanceRequestSchema, AuthCredentialsSchema,
  AuthTokenSchema, CAUTHEN, CAUTHEN_AUTHEN, CAUTHEN_AUTHEN_DEFAULT, CAUTHEN_AUTHEN_TYPED, DISPATCHER,
  DISPATCHER_AUTHEN
} from '@owlmeans/auth'
import { AppType } from '@owlmeans/context'
import { body, filter, module, query } from '@owlmeans/module'
import { route, RouteMethod, frontend, backend, socket } from '@owlmeans/route'

export const modules = [
  module(route(AUTHEN, '/authentication', backend())),
  module(route(AUTHEN_INIT, '/init', backend(AUTHEN, RouteMethod.POST)), filter(body(AllowanceRequestSchema))),
  module(route(AUTHEN_AUTHEN, '/authenticate', backend(AUTHEN, RouteMethod.POST)), filter(body(AuthCredentialsSchema))),
  module(route(AUTHEN_RELY, '/rely', socket(AUTHEN)), filter(query(AuthTokenSchema))),
  module(route(CAUTHEN, '/authentication', frontend())),
  module(route(CAUTHEN_AUTHEN, '/login', frontend(CAUTHEN))),
  module(route(CAUTHEN_AUTHEN_DEFAULT, '/', frontend(CAUTHEN_AUTHEN, true))),
  module(route(CAUTHEN_AUTHEN_TYPED, '/:type', frontend(CAUTHEN_AUTHEN))),
  module(
    route(DISPATCHER, '/dispatcher', frontend({ service: DISPATCHER })),
    // This module is sticky - it means it's always attach to client router.
    // It's required here cause every web app needs dispatcher route to authorize
    // rediected users.
    filter(query(AuthTokenSchema), { sticky: true })
  ),
  module(route(DISPATCHER_AUTHEN, '/authentication', backend(null, RouteMethod.POST)), filter(body(AuthTokenSchema))),
]

const skipModules = [DISPATCHER]
export const authBackendModules = modules.filter(
  module => !skipModules.includes(module.alias) && module.route.route.type === AppType.Backend
).map(module => module.alias)
