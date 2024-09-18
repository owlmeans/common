
import { module } from '@owlmeans/module'
import { route, backend, RouteMethod } from '@owlmeans/route'
import { keycloakApi } from './consts.js'

export const keycloakModules = [
  module(route(keycloakApi.group.list, '/admin/realms/:realm/groups', backend())),
  module(route(keycloakApi.group.get, '/admin/realms/:realm/groups/:groupId', backend())),
  module(route(keycloakApi.user.get, '/admin/realms/:realm/users/:userId', backend())),
  module(route(keycloakApi.organization.create, '/admin/realms/:realm/organizations/', backend(null, RouteMethod.POST))),
  module(route(keycloakApi.organization.get, '/admin/realms/:realm/organizations/:orgId', backend()))
]
