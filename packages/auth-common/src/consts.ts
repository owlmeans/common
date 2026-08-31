export const RELY_PIN_PERFIX = 'rely-pin:'

export const RELY_TOKEN_PREFIX = 'rely-token:'

export const RELY_CALL_TIMEOUT = 120

export const RELY_ACTION_TIMEOUT = 600

export const DISPATCHER_PATH = '/dispatcher'

export const DEF_AUTH_SRV = 'auth'

export const DEFAULT_GUARD = DEF_AUTH_SRV

export const TOKEN_UPDATE = 'auth-token-refresh'

export const WEB_API = 'web-auth-api'

/** Service alias of the organization-entity resolver, when an implementation registers one. */
export const ENTITY_RESOLVER = 'entity-resolver'

/**
 * What an organization slug may look like: a DNS label, lowercase.
 *
 * The constraint is not cosmetic. The same slug is used to compose hostnames, Kubernetes object
 * names and OIDC client ids, so anything that would need sanitising before it could address one of
 * those is rejected at the point it is chosen instead — a slug that survives this pattern passes
 * through every downstream name unchanged.
 */
export const ENTITY_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/

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

