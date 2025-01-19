
export const DEFAULT_ALIAS = 'oidc-client'

export const DEF_OIDC_ACCOUNT_LINKING = 'oidc-consumer-account-linking'

export const DEF_OIDC_PROVIDER_API = 'oidc-consumer-provider-api'

export const authService = {
  provider: {
    list: 'external-auth:provider:list'
  },
  auth: {
    update: 'external-auth:auth:update'
  }
}

export const OIDC_TOKEN_STORE = 'oidc-token-store'
/**
 * @TODO Actually these ones should be constants and should be linked to
 * configuration on OIDC provider side
 */
export const PROVIDER_CACHE_TTL = (5 * 60 - 1) * 1000

export const OIDC_AUTH_LIFTETIME = 24 * 3600 * 1000

export const OIDC_WRAP_FRESHNESS = (5 * 60 - 1) * 1000
