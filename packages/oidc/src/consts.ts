
import { PARAM } from '@owlmeans/route'

export const DEFAULT_PATH = 'oidc'

export const DEFAULT_FRONT = 'oidc-client'

/** The path param carrying the interaction uid — every INTERACTION route must declare it. */
export const INTERACTION_UID = 'uid'

export const INTERACTION_PATH = `/interaction/${PARAM}${INTERACTION_UID}`

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

/** Lists the organizations the session's subject belongs to. */
export const DISPATCHER_OIDC_ORGANIZATIONS = 'dispatcher:oidc:organizations'

/** Switches the organization the session acts in. */
export const DISPATCHER_OIDC_ORGANIZATION = 'dispatcher:oidc:organization'

export const OIDC_CODE_QUERY = 'code'

/**
 * Query params an authorization server sets on the redirect URI when the request failed
 * (RFC 6749 §4.1.2.1). Their presence means the flow is over — a relying party that re-enters
 * authorization on seeing them loops between itself and the provider forever.
 */
export const OIDC_ERROR_QUERY = 'error'

export const OIDC_ERROR_DESCRIPTION_QUERY = 'error_description'

export const OIDC_WRAPPED_TOKEN = 'oidc-wrapped-token'

export const WRAPPED_OIDC = 'wrapped-oidc-authz'

export const OIDC_GATE = 'oidc-gate'

/** Standard OIDC scope that requests the `email` / `email_verified` claims. */
export const EMAIL_SCOPE = 'email'

/** OIDC scope that requests the permissions claim from the integrated provider. */
export const PERMISSIONS_SCOPE = 'permissions'

/**
 * The scopes an OwlMeans relying party asks for on every authorization request, before the
 * provider-specific `extraScopes` are appended.
 *
 * Any provider we register a client with must allow all of them: `oidc-provider` rejects the whole
 * request with `invalid_scope` when a requested scope is one it supports but the client is not
 * allowed to use (`email` is such a scope — it exists as soon as `claims.email` is configured).
 */
export const OIDC_RP_BASE_SCOPES = ['openid', 'profile', EMAIL_SCOPE]

/** `OIDC_RP_BASE_SCOPES` as the space-delimited string an authorization request carries. */
export const OIDC_RP_BASE_SCOPE = OIDC_RP_BASE_SCOPES.join(' ')

/** Token/userinfo claim carrying the subject's PermissionSet[] for the requesting client. */
export const PERMISSIONS_CLAIM = 'permissions'

/**
 * OIDC scope of a tenanted client: the provider answers it with the subject's organizations and
 * the full permission claim, bound sets included. A client that never asks for it gets the
 * flattened claim of the one organization it acts in, exactly as before the scope existed.
 */
export const ORGANIZATIONS_SCOPE = 'organizations'

/** Token/userinfo claim carrying the subject's `OidcOrganizationClaim[]`. */
export const ORGANIZATIONS_CLAIM = 'organizations'

/** `AuthForbidden` reason: the organization named is not one the subject belongs to. */
export const ORGANIZATION_REFUSAL = 'organization'

/** `AuthForbidden` reason: the action needs the organization's owner. */
export const ORGANIZATION_OWNER_REFUSAL = 'organization:owner'

/** Discovery-document field carrying the base URL of the provider's runtime IAM API. */
export const IAM_API_METADATA = 'owlmeans_iam_api'
