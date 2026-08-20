import type { InitializedService } from '@owlmeans/context'
import type { OidcProviderConfig } from '@owlmeans/oidc'

export interface IamClient {
  id?: string
  clientId: string
  secret?: string
  name?: string
  /** The entity realm this client belongs to — replaces the old (client as any)._realm hack */
  realm?: string
}

export interface IamCredentialsPair {
  token: string
  realm: string
}

export interface IamClientOptions {
  /**
   * Explicit allowed redirect URIs for the client. Pass the concrete callbacks a deployment
   * may return to — the generated host, an attached custom domain, and owner-registered
   * self-host origins.
   *
   * Omitting them is a **legacy keycloak-only** shape: Keycloak accepts a `*` wildcard, while
   * the integrated provider does exact `redirect_uri` matching and rejects a wildcard outright
   * (`oidc-provider` refuses a client whose `redirect_uris` are not absolute URIs). Backends
   * that cannot honour a wildcard MUST throw `IamClientError` instead of registering an
   * unusable client.
   */
  redirectUris?: string[]
}

export interface IamPermissionArgs {
  /** Action name. When absent the permission is unscoped (project-wide). */
  permission?: string
  /** Declares that grants of this permission may be bound to specific resource ids. */
  resourceScoped?: boolean
  /** Optional human-readable title for the permission definition. */
  title?: string
}

export interface IamResourceSpec {
  name: string
  displayName?: string
}

/** A permission declared for an entity's client (project). */
export interface IamPermissionDefinition {
  /** Canonical name: "res--action" or bare "res" when unscoped. */
  name: string
  resource: string
  action?: string
  resourceScoped?: boolean
  title?: string
}

export interface IamGrantArgs {
  /** Resource ids for the resource-scoped grant form; omit for an unscoped (project-wide) grant. */
  resources?: string[]
}

/** A permission granted to an end-user subject of an entity's client. */
export interface IamGrant {
  /** Backend-specific subject id: integrated = IdentityProfile.profileId, keycloak = KC user id. */
  profileId: string
  clientId: string
  /** Canonical permission name. */
  permission: string
  /** Present only for resource-scoped grants. */
  resources?: string[]
}

/** An end-user of an entity (customer-wide; shared across that entity's projects). */
export interface IamUser {
  /** Backend-specific subject id: integrated = IdentityProfile.profileId, keycloak = KC user id. */
  profileId: string
  /** Primary login identifier (email for the integrated OTP path). */
  email?: string
  name?: string
  /** AuthRole value. */
  role: string
  disabled?: boolean
  /** Convenience count of permission grants the user holds (across clients, or for one client). */
  grantCount?: number
}

/** Args to invite/create an end-user under an entity. */
export interface IamUserInvite {
  email: string
  name?: string
  /** AuthRole value; defaults to the backend's standard end-user role. */
  role?: string
}

/** Args to update an existing end-user. */
export interface IamUserUpdate {
  name?: string
  role?: string
  disabled?: boolean
}

/** Unified IAM provider interface — all platform/agent code calls only this, never a backend directly */
export interface IamService extends InitializedService {
  // --- Admin config (backend → OIDC RP config, payment provisioning) ---
  getEntityAdminConfig: (entityId: string) => Promise<OidcProviderConfig>
  getCredentialsPair: (entityId: string) => Promise<IamCredentialsPair>

  /**
   * The public, fully-qualified OIDC **issuer** URL a relying party of this entity must use for
   * discovery — the single value a consumer needs (`OidcProviderDescriptor.discoveryUrl`). Each
   * backend owns its own URL shape: keycloak `https://{iam-host}/realms/{entityId}`, integrated
   * `https://{provider-host}/{basePath}`. Nothing outside an adapter may reassemble it.
   *
   * The returned string MUST equal, byte for byte, what the provider advertises as `issuer` in
   * its discovery document: `openid-client` compares the two and fails the whole discovery when
   * they differ. Implementations resolve it from configuration only — no remote admin call — and
   * throw `IamClientError` when the provider's service route is not configured, so a
   * misconfiguration is loud instead of yielding a silently wrong issuer.
   */
  getIssuerUrl: (entityId: string) => Promise<string>

  // --- Provisioning (agent → story development) ---

  /**
   * Find-or-create the entity's OIDC client.
   *
   * A client id is globally unique — a provider resolves it from the bare `client_id` a relying
   * party sends, with no tenant context — so an implementation MUST refuse an existing record
   * that belongs to a different entity (`IamClientError('client:entity-mismatch')`) rather than
   * returning it. Silently adopting one hands the caller another tenant's secret and overwrites
   * that tenant's redirect URIs.
   */
  ensureClient: (entityId: string, clientId: string, options?: IamClientOptions) => Promise<IamClient>

  /**
   * Reserve a client id for the entity without provisioning it, so a caller can find a free name
   * before committing to it. Returns false when the id is already taken — by this entity or any
   * other — and true when the reservation is now held.
   *
   * This exists because the id is minted from a name that may later be released (a project alias
   * moves when its hostname is refused), so the naming index cannot answer whether an id is free.
   * The registry is the only authority.
   */
  claimClient: (entityId: string, clientId: string) => Promise<boolean>

  /**
   * Release a client id and everything keyed by it. Called when a project or slot is deleted —
   * without it a recreated project can inherit a stale registration.
   */
  deleteClient: (entityId: string, clientId: string) => Promise<void>

  /**
   * Ensures a permission/resource exists in the entity's client.
   * Returns the canonical resource name (e.g. "res--action" or "res").
   */
  ensurePermission: (
    entityId: string,
    clientId: string,
    resource?: string,
    args?: IamPermissionArgs
  ) => Promise<string>

  /**
   * Idempotent: creates a resource, a client role for it, and assigns that role to
   * the entity-owner role. Used by payment provisioning for account/project/wl resources.
   */
  ensureResourceOwnership: (
    entityId: string,
    clientId: string,
    resource: IamResourceSpec
  ) => Promise<void>

  // --- Authorization (permission definitions & grants) ---

  /** Lists permission definitions registered for the entity's client. */
  listPermissions: (entityId: string, clientId: string) => Promise<IamPermissionDefinition[]>

  /**
   * Grants a permission to an end-user subject. With args.resources the grant is
   * resource-scoped (bound to those resource ids); without it the grant is project-wide.
   */
  grantPermission: (
    entityId: string,
    clientId: string,
    profileId: string,
    permission: string,
    args?: IamGrantArgs
  ) => Promise<IamGrant>

  /**
   * Revokes a grant. With args.resources only those resource ids are removed;
   * without it the whole grant is removed.
   */
  revokePermission: (
    entityId: string,
    clientId: string,
    profileId: string,
    permission: string,
    args?: IamGrantArgs
  ) => Promise<void>

  /** Lists grants for the entity's client, optionally for a single subject. */
  listGrants: (entityId: string, clientId: string, profileId?: string) => Promise<IamGrant[]>

  // --- End-user management (customer-wide users, shared per entityId) ---

  /**
   * Lists the entity's end-users. End-users are customer-wide — shared across every project of
   * the entity — so `clientId` scopes the reported `grantCount` to one project's client and does
   * **not** filter the set: a user who has authenticated against a project but holds no grant
   * there is still that project's user, and the screen that manages grants is exactly where they
   * must be visible.
   */
  listUsers: (entityId: string, clientId?: string) => Promise<IamUser[]>

  /** Loads a single end-user by subject id, or null when absent. */
  getUser: (entityId: string, profileId: string) => Promise<IamUser | null>

  /** Creates (or resolves, idempotently by email) an end-user under the entity. */
  inviteUser: (entityId: string, invite: IamUserInvite) => Promise<IamUser>

  /** Updates an end-user's mutable fields (name, role, disabled). */
  updateUser: (entityId: string, profileId: string, update: IamUserUpdate) => Promise<IamUser>

  /** Removes an end-user from the entity (their grants go with them). */
  removeUser: (entityId: string, profileId: string) => Promise<void>
}
