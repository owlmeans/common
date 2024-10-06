
import {
  AUTHEN, AUTHEN_AUTHEN, AUTHEN_INIT, AUTHEN_RELY, AllowanceRequestSchema, AuthCredentialsSchema,
  AuthTokenSchema, CAUTHEN, CAUTHEN_AUTHEN, CAUTHEN_AUTHEN_DEFAULT, CAUTHEN_AUTHEN_TYPED, DISPATCHER,
  DISPATCHER_AUTHEN, OptionalAuthTokenSchema, CAUTHEN_FLOW_ENTER
} from '@owlmeans/auth'
// import { AppType } from '@owlmeans/context'
import { body, filter, module, query } from '@owlmeans/module'
import { route, RouteMethod, frontend, backend, socket } from '@owlmeans/route'
import { DISPATCHER_PATH } from './consts.js'

export const modules = [
  module(route(AUTHEN, '/authentication', backend())),
  module(route(AUTHEN_INIT, '/init', backend(AUTHEN, RouteMethod.POST)), filter(body(AllowanceRequestSchema))),
  module(route(AUTHEN_AUTHEN, '/authenticate', backend(AUTHEN, RouteMethod.POST)), filter(body(AuthCredentialsSchema))),
  module(route(AUTHEN_RELY, '/rely', socket(AUTHEN)), filter(query(OptionalAuthTokenSchema))),
  module(route(CAUTHEN, '/authentication', frontend())),
  module(route(CAUTHEN_AUTHEN, '/login', frontend(CAUTHEN))),
  module(route(CAUTHEN_AUTHEN_DEFAULT, '/', frontend(CAUTHEN_AUTHEN, true))),
  module(route(CAUTHEN_AUTHEN_TYPED, '/:type', frontend(CAUTHEN_AUTHEN))),
  // This is a helper route that is used by service providers to redirect to an external authentication service.
  module(route(CAUTHEN_FLOW_ENTER, '/', frontend())),
  // This is a helper route that is useb by service providres to process authentication provisioning via redirect.
  // Also it can be default starting point to be redirected to an external identity provider.
  module(
    route(DISPATCHER, DISPATCHER_PATH, frontend({ service: DISPATCHER })),
    // This module is sticky - it means it's always attach to client router.
    // It's required here cause every web app needs dispatcher route to authorize
    // rediected users.
    filter(query(AuthTokenSchema), { sticky: true })
  ),
  // This is a helper route that representes a API endpoint of service provider that wants to authenticate 
  // a user with OwlMeans server-auth library.
  module(route(DISPATCHER_AUTHEN, '/authentication', backend(null, RouteMethod.POST)), filter(body(AuthTokenSchema))),
]

// const skipModules = [DISPATCHER]
// export const authBackendModules = modules.filter(
//   module => !skipModules.includes(module.alias) && module.route.route.type === AppType.Backend
// ).map(module => module.alias)
