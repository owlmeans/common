import type { KeycloakApiService } from './types.js'
import type { AppConfig, AppContext, ClientModule } from '@owlmeans/server-app'
import { assertContext, createService } from '@owlmeans/context'
import { DEFAULT_ALIAS, keycloakApi } from './consts.js'
import { prepareToken } from './utils/token.js'
import type { IdentityProviderLink, Organization, OrgCreationResult, User } from './types/index.js'
import { KeycloakOrphanUser } from './errors.js'
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
    },

    getUserDetailsWithOrg: async (token, userId) => {
      const context = assertContext<AppConfig, AppContext>(service.ctx as AppContext)
      const mod = context.module<ClientModule<User>>(keycloakApi.user.get)
      const request = prepareToken(token)
      request.params.userId = userId
      const [user] = await mod.call(request)

      // @TODO This is too implemnetation specific - it needs to be abstracted someway
      let entityId: string | undefined
      if (user.attributes?.['kc.org'] != null && Array.isArray(user.attributes['kc.org'])
        && user.attributes['kc.org'].length > 0) {
        entityId = user.attributes['kc.org'][0]
      }

      return {
        userId: user.id,
        username: user.username,
        entityId
      }
    },

    // @TODO This method is also quite implementation specific and need to also be moved 
    // somwhere else (if it is needed in general)
    enrichUserWithOrg: async (token, details) => {
      const context = assertContext<AppConfig, AppContext>(service.ctx as AppContext)
      if (details.entityId == null) {
        const create = context.module<ClientModule<OrgCreationResult>>(keycloakApi.organization.create)

        // @TODO we need to properly check if an organization is already exists and 
        // generate unique name for it
        const [result] = await create.call({
          ...prepareToken(token), body: {
            name: `org-for-${details.username}`,
            attributes: {},
            description: '',
            domains: [{ name: `domain-for-${details.username}`, verified: false }]
          }
        })

        const parts = result.location.split('/')
        const id = parts[parts.length - 1]

        const orgRequest = prepareToken(token)
        orgRequest.params.orgId = id
        const [org] = await context.module<ClientModule<Organization>>(keycloakApi.organization.get)
          .call(orgRequest)

        if (org == null) {
          throw new KeycloakOrphanUser()
        }

        const newMemberReq = prepareToken(token)
        newMemberReq.params.orgId = org.id
        await context.module<ClientModule>(keycloakApi.organization.addMember)
          .call({ ...newMemberReq, body: details.userId })

        // @TODO Make the user the organization mananger

        details.entityId = org.id
      }

      return details
    }
  }, service => async () => {
    service.initialized = true
  })

  return service
}
