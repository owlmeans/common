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
}

export interface IamResourceSpec {
  name: string
  displayName?: string
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
}
