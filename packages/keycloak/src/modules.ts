
import { module } from '@owlmeans/module'
import { route, backend } from '@owlmeans/route'
import { keycloakApi } from './consts.js'

export const keycloakModules = [
  module(route(keycloakApi.user.get, '/admin/realms/:realm/users/:userId', backend())),
  module(route(keycloakApi.user.idps.list, '/admin/realms/:realm/users/:userId/federated-identity', backend())),
]
