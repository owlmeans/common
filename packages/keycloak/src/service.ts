import type { KeycloakApiService } from './types.js'
import type { AppConfig, AppContext, ClientModule } from '@owlmeans/server-app'
import { assertContext, createService } from '@owlmeans/context'
import { DEFAULT_ALIAS, keycloakApi } from './consts.js'
import { prepareToken } from './utils/token.js'

import type { Organization, OrgCreationResult, User } from './types/index.js'
import { KeycloakOrphanUser } from './errors.js'

export const makeKeycloakApiService = (alias: string = DEFAULT_ALIAS): KeycloakApiService => {
  const service: KeycloakApiService = createService<KeycloakApiService>(alias, {
    getUserDetails: async (token, userId) => {
      const context = assertContext<AppConfig, AppContext>(service.ctx as AppContext)
      const mod = context.module<ClientModule<User>>(keycloakApi.user.get)
      const request = prepareToken(token)
      request.params.userId = userId
      const [user] = await mod.call(request)

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

    enrichUser: async (token, details) => {
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
