
export const DEFAULT_PATH = 'oidc'

export const DEFAULT_FRONT = 'oidc-client'

export const INTERACTION_PATH = '/interaction/:uid'

export const INTERACTION = 'oidc:interaction'

export const OIDC_FLOW = 'oidc'

export const OIDC_AUTHEN_MODULE = 'iam-oidc-authen'

export const PROVIDER_INTERACTION = 'oidc-server:interaction'

export const OIDC_CLIENT_AUTH = 'oidc-client'

export const GOOGLE_CLIENT_AUTH = 'google-oauth'

// This constant is the name of oidc identity provider that is called service in the oidc provider config. 
export const GOOGLE_SERVICE = 'google'

export const OIDC_GUARD = 'guard:oidc'

export const OIDC_GUARD_CACHE = 'resource:oidc-guard:cache'

export const DISPATCHER_OIDC_INIT = 'dispatcher:oidc:init'

export const DISPATCHER_OIDC = 'dispatcher:oidc:authenticate'

export const OIDC_CODE_QUERY = 'code'

export const OIDC_WRAPPED_TOKEN = 'oidc-wrapped-token'

export const WRAPPED_OIDC = 'wrapped-oidc-authz'

export const OIDC_GATE = 'oidc-gate'

/** OIDC scope that requests the permissions claim from the integrated provider. */
export const PERMISSIONS_SCOPE = 'permissions'

/** Token/userinfo claim carrying the subject's PermissionSet[] for the requesting client. */
export const PERMISSIONS_CLAIM = 'permissions'
