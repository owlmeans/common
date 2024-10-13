import { DEF_OIDC_PROVIDER_API } from '@owlmeans/server-oidc-rp'
import type { RoleMap } from './types.js'

export const DEFAULT_ALIAS = DEF_OIDC_PROVIDER_API

export const keycloakApi = {
  user: {
    get: 'keycloak-api:user:get',
    create: 'keycloak-api:user:create',
    idps: {
      list: 'keycloak-api:user:idps',
      create: 'keycloak-api:user:idps:create', 
    },
    roles: {
      client: {
        available: 'keycloak-api:user:roles:client:available',
        create: 'keycloak-api:user:roles:client:create',
      },
    },
  },
  client: {
    list: 'keycloak-api:client:list',
  },
}

export const adminDetaultBlackList: RoleMap = {
  'account': {
    blacklist: true,
    roles: ['delete-account'],
  },
  'admin-cli': {
    blacklist: true,
  },
  'broker': {
    blacklist: true,
  },
  'realm-management': {
    blacklist: true,
  },
}
