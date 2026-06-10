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

/** Unified IAM provider interface — all platform/agent code calls only this, never a backend directly */
export interface IamService extends InitializedService {
  // --- Admin config (backend → OIDC RP config, payment provisioning) ---
  getEntityAdminConfig: (entityId: string) => Promise<OidcProviderConfig>
  getCredentialsPair: (entityId: string) => Promise<IamCredentialsPair>

  // --- Provisioning (agent → story development) ---
  ensureClient: (entityId: string, clientId: string) => Promise<IamClient>

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
}
