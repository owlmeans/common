
import {
  AUTHEN, AUTHEN_AUTHEN, AUTHEN_INIT, AUTHEN_RELY, AllowanceRequestSchema, AuthCredentialsSchema,
  AuthTokenSchema, CAUTHEN, CAUTHEN_AUTHEN, CAUTHEN_AUTHEN_DEFAULT, CAUTHEN_AUTHEN_TYPED, DISPATCHER,
  DISPATCHER_AUTHEN, DISPATCHER_SURROGATE, OptionalAuthTokenSchema, CAUTHEN_FLOW_ENTER
} from '@owlmeans/auth'
import type { AllowanceRequest, AllowanceResponse, AuthCredentials, AuthToken } from '@owlmeans/auth'
// import { AppType } from '@owlmeans/context'
import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import { route, RouteMethod, frontend, backend, socket } from '@owlmeans/route'
import { DISPATCHER_PATH, SURROGATE_PATH, WEB_API, authApi } from './consts.js'
import { SurrogateQuerySchema } from './schemas.js'
import type { SurrogateQuery } from './schemas.js'

/** Shared authentication protocols, bound independently by server and browser packages. */
export const authProtocols = {
  authen: openProtocol(route(AUTHEN, '/authentication', backend())),
  init: protocol(route(AUTHEN_INIT, '/init', backend(AUTHEN, RouteMethod.POST)),
    contract.request({ body: typed<AllowanceRequest>(AllowanceRequestSchema) }, typed<AllowanceResponse>())),
  authenticate: protocol(route(AUTHEN_AUTHEN, '/authenticate', backend(AUTHEN, RouteMethod.POST)),
    contract.request({ body: typed<AuthCredentials>(AuthCredentialsSchema) }, typed<AuthToken>())),
  rely: protocol(route(AUTHEN_RELY, '/rely', socket(AUTHEN)),
    contract.request({ query: typed<Partial<AuthToken>>(OptionalAuthTokenSchema) }, typed<undefined>())),
  client: openProtocol(route(CAUTHEN, '/authentication', frontend())),
  login: openProtocol(route(CAUTHEN_AUTHEN, '/login', frontend(CAUTHEN))),
  loginDefault: openProtocol(route(CAUTHEN_AUTHEN_DEFAULT, '/', frontend(CAUTHEN_AUTHEN, true))),
  loginTyped: openProtocol(route(CAUTHEN_AUTHEN_TYPED, '/:type', frontend(CAUTHEN_AUTHEN))),
  flowEnter: openProtocol(route(CAUTHEN_FLOW_ENTER, '/', frontend())),
  dispatcher: protocol(
    route(DISPATCHER, DISPATCHER_PATH, frontend({ service: DISPATCHER })),
    contract.request({ query: typed<AuthToken>(AuthTokenSchema) }, typed()),
    { sticky: true },
  ),
  // The login window an embedded application opens one level up.
  //
  // Top level and with no parent, so it renders outside every application layout — a popup must
  // never show the application, with its navigation, inside itself. Sticky for the same reason the
  // dispatcher is: it must attach to the client router regardless of service selection. It carries
  // no `service`, unlike the dispatcher, because nothing server-side ever addresses it — the
  // provider's callback goes to the dispatcher. And no guard: it is where a signed-out user lands.
  surrogate: protocol(
    route(DISPATCHER_SURROGATE, SURROGATE_PATH, frontend()),
    contract.request({ query: typed<SurrogateQuery>(SurrogateQuerySchema) }, typed()),
    { sticky: true },
  ),
  // This is a helper route that representes a API endpoint of service provider that wants to authenticate
  // a user with OwlMeans server-auth library.
  dispatcherAuthenticate: protocol(route(DISPATCHER_AUTHEN, '/authenticate', backend(null, RouteMethod.POST)),
    contract.request({ body: typed<AuthToken>(AuthTokenSchema) }, typed<AuthToken>())),
}

/** Shared manager authentication protocols. */
export const managerProtocols = {
  profile: {
    base: openProtocol(route(authApi.profile.base, '/profile', backend({ service: WEB_API }))),
    toEntityId: openProtocol(route(
    authApi.profile.toEntityId, '/to-entity-id',
    backend(authApi.profile.base, RouteMethod.POST)
    )),
  },
  auth: {
    base: openProtocol(route(authApi.auth.base, '/auth', backend({ service: WEB_API }))),
    delegate: openProtocol(route(
    authApi.auth.delegate, '/delegate',
    backend(authApi.auth.base, RouteMethod.POST)
    )),
  },
}

// const skipEntrypoints = [DISPATCHER]
// export const authBackendEntrypoints = entrypoints.filter(
//   module => !skipEntrypoints.includes(module.alias) && module.route.route.type === AppType.Backend
// ).map(module => module.alias)
