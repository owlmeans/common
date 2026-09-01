
import {
  AUTHEN, AUTHEN_AUTHEN, AUTHEN_INIT, AUTHEN_RELY, AllowanceRequestSchema, AuthCredentialsSchema,
  AuthTokenSchema, CAUTHEN, CAUTHEN_AUTHEN, CAUTHEN_AUTHEN_DEFAULT, CAUTHEN_AUTHEN_TYPED, DISPATCHER,
  DISPATCHER_AUTHEN, DISPATCHER_SURROGATE, OptionalAuthTokenSchema, CAUTHEN_FLOW_ENTER
} from '@owlmeans/auth'
// import { AppType } from '@owlmeans/context'
import { body, filter, entrypoint, query } from '@owlmeans/entrypoint'
import { route, RouteMethod, frontend, backend, socket } from '@owlmeans/route'
import { DISPATCHER_PATH, SURROGATE_PATH, WEB_API, authApi } from './consts.js'
import { SurrogateQuerySchema } from './schemas.js'

export const modules = [
  entrypoint(route(AUTHEN, '/authentication', backend())),
  entrypoint(route(AUTHEN_INIT, '/init', backend(AUTHEN, RouteMethod.POST)), filter(body(AllowanceRequestSchema))),
  entrypoint(route(AUTHEN_AUTHEN, '/authenticate', backend(AUTHEN, RouteMethod.POST)), filter(body(AuthCredentialsSchema))),
  entrypoint(route(AUTHEN_RELY, '/rely', socket(AUTHEN)), filter(query(OptionalAuthTokenSchema))),
  entrypoint(route(CAUTHEN, '/authentication', frontend())),
  entrypoint(route(CAUTHEN_AUTHEN, '/login', frontend(CAUTHEN))),
  entrypoint(route(CAUTHEN_AUTHEN_DEFAULT, '/', frontend(CAUTHEN_AUTHEN, true))),
  entrypoint(route(CAUTHEN_AUTHEN_TYPED, '/:type', frontend(CAUTHEN_AUTHEN))),
  // This is a helper route that is used by service providers to redirect to an external authentication service.
  entrypoint(route(CAUTHEN_FLOW_ENTER, '/', frontend())),
  // This is a helper route that is useb by service providres to process authentication provisioning via redirect.
  // Also it can be default starting point to be redirected to an external identity provider.
  entrypoint(
    route(DISPATCHER, DISPATCHER_PATH, frontend({ service: DISPATCHER })),
    // This module is sticky - it means it's always attach to client router.
    // It's required here cause every web app needs dispatcher route to authorize
    // rediected users.
    filter(query(AuthTokenSchema), { sticky: true })
  ),
  // The login window an embedded application opens one level up.
  //
  // Top level and with no parent, so it renders outside every application layout — a popup must
  // never show the application, with its navigation, inside itself. Sticky for the same reason the
  // dispatcher is: it must attach to the client router regardless of service selection. It carries
  // no `service`, unlike the dispatcher, because nothing server-side ever addresses it — the
  // provider's callback goes to the dispatcher. And no guard: it is where a signed-out user lands.
  entrypoint(
    route(DISPATCHER_SURROGATE, SURROGATE_PATH, frontend()),
    filter(query(SurrogateQuerySchema), { sticky: true })
  ),
  // This is a helper route that representes a API endpoint of service provider that wants to authenticate
  // a user with OwlMeans server-auth library.
  entrypoint(route(DISPATCHER_AUTHEN, '/authenticate', backend(null, RouteMethod.POST)), filter(body(AuthTokenSchema))),
]

export const managerModules = [
  entrypoint(route(authApi.profile.base, '/profile', backend({ service: WEB_API }))),
  entrypoint(route(
    authApi.profile.toEntityId, '/to-entity-id',
    backend(authApi.profile.base, RouteMethod.POST)
  )),
  entrypoint(route(authApi.auth.base, '/auth', backend({ service: WEB_API }))),
  entrypoint(route(
    authApi.auth.delegate, '/delegate',
    backend(authApi.auth.base, RouteMethod.POST)
  )),
]

// const skipModules = [DISPATCHER]
// export const authBackendModules = modules.filter(
//   module => !skipModules.includes(module.alias) && module.route.route.type === AppType.Backend
// ).map(module => module.alias)
