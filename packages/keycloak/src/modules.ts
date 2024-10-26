
import { module } from '@owlmeans/module'
import { route, backend, RouteMethod } from '@owlmeans/route'
import { keycloakApi } from './consts.js'

export const keycloakModules = [
  module(route(keycloakApi.settings.get, '/admin/realms/:realm', backend())),

  module(route(keycloakApi.user.get, '/admin/realms/:realm/users/:userId', backend())),
  module(route(keycloakApi.user.idps.list, '/admin/realms/:realm/users/:userId/federated-identity', backend())),
  module(route(
    keycloakApi.user.idps.create,
    '/admin/realms/:realm/users/:userId/federated-identity/:provider',
    backend(null, RouteMethod.POST)
  )),
  module(route(keycloakApi.user.create, '/admin/realms/:realm/users', backend(null, RouteMethod.POST))),

  module(route(
    keycloakApi.user.roles.client.available, 
    '/admin/realms/:realm/users/:userId/role-mappings/clients/:client/available', 
    backend()
  )),
  module(route(
    keycloakApi.user.roles.client.create, 
    '/admin/realms/:realm/users/:userId/role-mappings/clients/:client',
    backend(null, RouteMethod.POST)
  )),

  module(route(keycloakApi.client.list, '/admin/realms/:realm/clients', backend())),
]
