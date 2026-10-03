import type { AuthToken, PermissionSet } from '@owlmeans/auth'
import type { AuthorizationService } from '@owlmeans/auth-common'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { GuardService, ResolvedEntity } from '@owlmeans/entrypoint'

export interface Config extends BasicConfig { }
export interface Context<C extends Config = Config> extends BasicContext<C> { }

export interface OidcSharedConfig {
  clientCookie?: {
    interaction?: {
      name?: string
      ttl?: number
    }
  },
  providers?: OidcProviderConfig[]
  /**
   * false - in case the service user can't use identity provider for authentication (restricted for internal use only)
   * true - in case only default identity provider can be used
   * string[] - list of allowed identity providers
   */
  restrictedProviders?: boolean | string[]
}

export interface OidcProviderConfig extends OidcProviderDescriptor {
  // Use this flag to allow only internal use 
  internal?: boolean
  // The client id that is used to administrate the underlying IAM service
  apiClientId?: string
}

export interface OidcProviderDescriptor {
  // Bound this client to sepcific organization entity
  entityId?: string
  service?: string
  discoveryUrl?: string
  basePath?: string
  clientId: string
  secret?: string
  redirectUri?: string
  extraScopes?: string
  authEndpoint?: string
  tokenEndpoint?: string
  userinfoEndpoint?: string
  idOverride?: string
  // This flag works only on client side. It specifies a default relying party
  def?: boolean
  /**
   * Require a live authorization-server decision before accepting a wrapped
   * session. `required` is for applications whose provider is their authority
   * for account disablement and permission changes.
   */
  sessionValidation?: 'required' | 'optional'
  /**
   * How this provider presents itself on the sign-in screen.
   *
   * A provider list is configuration, so the only place its human-readable name can come from is
   * the configuration itself — the client never talks to the issuer directly and has no discovery
   * document to read a name out of.
   */
  label?: string
  /** Icon registry NAME, never markup — this package must stay free of an icon library. */
  icon?: string
  /** Ascending. Absent means "after the default one". */
  order?: number
  /** Registered, but never offered as a choice. */
  hidden?: boolean
}


export interface WithSharedConfig {
  oidc: OidcSharedConfig
}

export interface OidcGuard extends GuardService {
}

export interface OidcGuardOptions {
  cache?: string
  coguards: string | string[]
  tokenService?: string
}

export interface OIDCAuthInitParams {
  entity?: string
  profile?: string
  /**
   * The organization the person asked to act in after sign-in. Honoured only when the provider
   * names it among the subject's organizations; otherwise the session starts in the home one.
   */
  entitySlug?: string
}

/** One organization of the subject, as the provider claims it under `ORGANIZATIONS_SCOPE`. */
export interface OidcOrganizationClaim {
  entitySlug: string
  /**
   * The organization's frozen IAM key — stable across renames, which is why a session remembers
   * its acting organization by it. Server-side only: never copied into a browser token or into a
   * response.
   */
  entityKey: string
  title?: string
  owner: boolean
  groups?: string[]
  home?: boolean
}

/**
 * A permission set as the provider claims it. A set carrying `entitySlug` is bound to that
 * organization and applies only while the session acts in it; one without applies everywhere.
 */
export interface OidcPermissionSetClaim extends PermissionSet {
  entitySlug?: string
}

/** One organization of the session, as the switch lists it — the key never leaves the server. */
export interface OidcOrganizationItem {
  entitySlug: string
  title?: string
  owner: boolean
  groups?: string[]
  home?: boolean
  acting: boolean
}

export interface OidcOrganizationList {
  items: OidcOrganizationItem[]
}

export interface OidcOrganizationSwitch {
  entitySlug: string
}

// @TODO replace arbitarary Record params with specific possible params for OIDC
export interface OIDCClientAuthPayload extends Record<string, string> {
  code: string
  authUrl: string
}

/**
 * A refreshed wrapped token, plus the organization the session acts in when the provider names
 * one. The guard attaches that entity to the request, because a relying party of a tenanted
 * client has no resolver of its own that could find it by slug.
 */
export interface WrappedOIDCUpdate extends AuthToken {
  entity?: ResolvedEntity
}

export interface WrappedOIDCService extends AuthorizationService {
  update: (token?: string | AuthToken, thr?: boolean) => Promise<WrappedOIDCUpdate | null>
}

export interface OIDCTokenUpdate extends AuthToken {
  tokenSet: CommonTokenSetParams
}

export interface CommonTokenSetParams extends Record<string, string | number | undefined> {
  access_token?: string
  token_type?: string
  id_token?: string
  refresh_token?: string
  scope?: string

  expires_at?: number
  session_state?: string
}


export interface ProviderProfileDetails extends Partial<OidcUserDetails> {
  type: string
  service: string
  clientId: string
  userId: string
  profileId?: string
}

export interface OidcUserDetails {
  userId: string
  username: string
  entityId?: string
  did?: string
  // This flag is used to identify OwlMeans ID and OwlMeans IAM user
  // The presence of OlwMeans ID exactly is defined by presence of the did field
  // alongisde this flag set to true
  // In general sence this flag is used to denounce that the authenticated
  // profile belongs to the governining organization.
  // So if the flag is ended up being true - it may also mean that the user
  // is governed by an organization that uses OwlMeans IAM solutions on premises basis.
  // Actually it makes this property untrasferable between different app services.
  isOwlMeansId?: boolean
}

export interface OidcProviderSettings {
  registrationEnabled: boolean
}
