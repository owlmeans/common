import type { KeycloakApiService } from './types.js'
import type { AppConfig, AppContext, ClientModule } from '@owlmeans/server-app'
import { assertContext, createService } from '@owlmeans/context'
import { DEFAULT_ALIAS, keycloakApi } from './consts.js'
import { prepareToken } from './utils/token.js'
import type { IdentityProviderLink, User } from './types/index.js'
import { KEY_OWL } from '@owlmeans/did'

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
    }
  }, service => async () => {
    service.initialized = true
  })

  return service
}
