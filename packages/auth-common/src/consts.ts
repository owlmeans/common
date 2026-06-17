export const RELY_PIN_PERFIX = 'rely-pin:'

export const RELY_TOKEN_PREFIX = 'rely-token:'

export const RELY_CALL_TIMEOUT = 120

export const RELY_ACTION_TIMEOUT = 600

export const DISPATCHER_PATH = '/dispatcher'

export const DEF_AUTH_SRV = 'auth'

export const DEFAULT_GUARD = DEF_AUTH_SRV

export const TOKEN_UPDATE = 'auth-token-refresh'

export const WEB_API = 'web-auth-api'

export const authApi = {
  profile: {
    base: 'api:profile',
    toEntityId: 'api:profile:to-entity-id',
  },
  entity: {
    base: 'api:entity',
    get: 'api:entity:get',
    profile: {
      base: 'api:entity:profile',
      list: 'api:entity:profile:list',
      link: 'api:entity:profile:link',
    }
  },
  auth: {
    base: 'api:auth',
    delegate: 'api:auth:delegate',
  },
}

