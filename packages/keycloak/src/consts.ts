import { DEF_OIDC_PROVIDER_API } from '@owlmeans/server-oidc-rp'

export const DEFAULT_ALIAS = DEF_OIDC_PROVIDER_API

export const keycloakApi = {
  group: {
    list: 'keycloak-api:group:list',
    get: 'keycloak-api:group:get'
  },
  user: {
    get: 'keycloak-api:user:get',
    idps: {
      list: 'keycloak-api:user:idps'
    }
  },
  organization: {
    create: 'keycloak-api:organization:create',
    get: 'keycloak-api:organization:get',
    addMember: 'keycloak-api:organization:addMember',
  },
}
