import type { KeycloakApiService } from './types.js'
import type { AppConfig, AppContext, ClientModule } from '@owlmeans/server-app'
import { assertContext, createService } from '@owlmeans/context'
import { DEFAULT_ALIAS, keycloakApi } from './consts.js'
import { prepareToken } from './utils/token.js'

import type { GroupListItem, Organization, OrgCreationResult, User } from './types/index.js'
import { KeycloakOrphanUser } from './errors.js'

export const makeKeycloakApiService = (alias: string = DEFAULT_ALIAS): KeycloakApiService => {
  const service: KeycloakApiService = createService<KeycloakApiService>(alias, {
    /**
     * @TODO Make some sense out of this method
     * Right now it's a complete havoc.
     */
    getOrganizationDetails: async (token, organization) => {
      const context = assertContext<AppConfig, AppContext>(service.ctx as AppContext)

      console.log("organization", organization)
      const listMod = context.module<ClientModule<GroupListItem[]>>(keycloakApi.group.list)
      const [result] = await listMod.call(prepareToken(token))

      console.log('Group search result', result)

      const getMod = context.module<ClientModule>(keycloakApi.group.get)

      const groupRequest = prepareToken(token)
      groupRequest.params.groupId = result[0].id
      const [group] = await getMod.call(groupRequest)

      console.log('group details', group)
    },

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

      console.log('user we got', user)

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

        console.log("enreach user with org", org)

        // @TODO Proceed adding the user to the organization
        // Ideally he must be made the organization manager

        details.entityId = org.id
      }

      return details
    }
  }, service => async () => {
    service.initialized = true
  })

  return service
}
