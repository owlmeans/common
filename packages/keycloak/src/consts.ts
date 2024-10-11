import { DEF_OIDC_PROVIDER_API } from '@owlmeans/server-oidc-rp'

export const DEFAULT_ALIAS = DEF_OIDC_PROVIDER_API

export const keycloakApi = {
  user: {
    get: 'keycloak-api:user:get',
    idps: {
      list: 'keycloak-api:user:idps'
    }
  },
}
