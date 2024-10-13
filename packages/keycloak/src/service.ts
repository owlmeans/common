import type { KeycloakApiService } from './types.js'
import type { AppConfig, AppContext, ClientModule } from '@owlmeans/server-app'
import { ModuleOutcome } from '@owlmeans/server-app'
import { assertContext, createService } from '@owlmeans/context'
import { adminDetaultBlackList, DEFAULT_ALIAS, keycloakApi } from './consts.js'
import { prepareToken } from './utils/token.js'
import type { User } from './types/user.js'
import type { IdentityProviderLink } from './types/idp.js'
import { KEY_OWL } from '@owlmeans/did'
import type { WithLocation } from './utils/types.js'
import { KeycloakCreationError } from './errors.js'
import type { Role } from './types/role.js'
import { Client } from './types/client.js'

export const makeKeycloakApiService = (alias: string = DEFAULT_ALIAS): KeycloakApiService => {
  const service: KeycloakApiService = createService<KeycloakApiService>(alias, {
    getUserDetails: async (token, userId) => {
      const context = assertContext<AppConfig, AppContext>(service.ctx as AppContext)
      const mod = context.module<ClientModule<User>>(keycloakApi.user.get)
      const request = prepareToken(token)
      request.params.userId = userId
      const [user] = await mod.call(request)

      const idpsReq = prepareToken(token)
      idpsReq.params.userId = user.id
      const [idps] = await context.module<ClientModule<IdentityProviderLink[]>>(keycloakApi.user.idps.list)
        .call(idpsReq)
      // @TODO Use some helper function to check if the id is an OwlMeans DID
      const owlMeansId = idps.find(idp => idp.userId.startsWith(KEY_OWL + ':'))

      return {
        userId: user.id,
        username: user.username,
        did: owlMeansId?.userId,
        ...(owlMeansId != null ? { isOwlMeansId: true } : {})
      }
    },

    createUser: async (token, payload, idps) => {
      const context = service.assertCtx<AppConfig, AppContext>()
      const request = prepareToken(token)
      const create = context.module<ClientModule<WithLocation>>(keycloakApi.user.create)
      const [location, ok] = await create.call({ ...request, body: payload })
      if (ok !== ModuleOutcome.Created) {
        throw new KeycloakCreationError('user')
      }
      const userId = location?.location?.split('/').pop()
      if (userId == null) {
        throw new KeycloakCreationError('user')
      }
      request.params.userId = userId
      const addIdp = context.module<ClientModule>(keycloakApi.user.idps.create)
      for (const idp of idps ?? []) {
        request.params.provider = idp.identityProvider
        const [, ok] = await addIdp.call({ ...request, body: idp })
        if (ok !== ModuleOutcome.Finished) {
          throw new KeycloakCreationError('idp')
        }
      }

      const [user] = await context.module<ClientModule<User>>(keycloakApi.user.get).call(request)
      if (user == null) {
        throw new KeycloakCreationError('user')
      }

      return user
    },

    assignClientRoles: async (token, userId, roleMap = adminDetaultBlackList) => {
      const context = service.assertCtx<AppConfig, AppContext>()
      const request = prepareToken(token)
      request.params.userId = userId
      const clients = context.module<ClientModule<Client[]>>(keycloakApi.client.list)
      const listClientRoles = context.module<ClientModule<Role[]>>(keycloakApi.user.roles.client.available)
      const add = context.module<ClientModule>(keycloakApi.user.roles.client.create)

      for (const client in roleMap) {
        const roles: Role[] = []
        const [list] = await clients.call({
          ...request, query: { first: 0, max: 100, search: true, clientId: client }
        })
        const _client = list.find(_client => _client.clientId === client)
        if (_client == null) {
          continue
        }

        request.params.client = _client.id
        const [_roles] = await listClientRoles.call(request)
        const filter = roleMap[client]
        roles.push(..._roles.filter(
          role => filter.blacklist ? !filter.roles?.includes(role.name) : filter.roles?.includes(role.name)
        ))

        const [, ok] = await add.call({ ...request, body: roles.map(({ description, id, name }) => ({ description, id, name })) })
        if (ok !== ModuleOutcome.Finished) {
          throw new KeycloakCreationError('role-map')
        }
      }
    },
  }, service => async () => {
    service.initialized = true
  })

  return service
}
