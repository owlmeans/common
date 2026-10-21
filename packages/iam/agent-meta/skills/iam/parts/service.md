---
name: service
description: The full IamService interface with its per-method contracts, and the per-client user operations.
metadata:
  purposes: auth, server-api
  mentions: IamService, getEntityAdminConfig, ensureClient, getClient, grantBundle, listGrants, listUsers, inviteUser, updateUser, removeUser, syncStaff, normalizePermissions, deletePermission
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/iam — The IamService interface

## `IamService` interface

```ts
interface IamService extends InitializedService {
  // The tenant's admin OIDC provider config, and a raw admin { token, realm } pair.
  getEntityAdminConfig: (entityId: string) => Promise<OidcProviderConfig>
  getCredentialsPair: (entityId: string) => Promise<IamCredentialsPair>

  // The tenant's public issuer URL — see "Issuer & redirect URIs" (the clients part).
  getIssuerUrl: (entityId: string) => Promise<string>

  // Provision an OIDC client for a tenant — see "Issuer & redirect URIs" and
  // "A client id is a global name" (the clients part) for the two rules it has to obey.
  ensureClient: (entityId: string, clientId: string, options?: IamClientOptions) => Promise<IamClient>

  // The entity's client without its secret, or null. Never provisions.
  getClient: (entityId: string, clientId: string) => Promise<IamClientInfo | null>

  // Reserve a free client id without provisioning it; false when anyone else holds it.
  claimClient: (entityId: string, clientId: string) => Promise<boolean>

  // Release a client id and everything keyed by it — its subjects' rows, its groups, its
  // definitions (called when a project/slot is deleted).
  deleteClient: (entityId: string, clientId: string) => Promise<void>

  // Declare a permission. Returns the canonical name. MERGES into an existing definition —
  // resource/action re-derived, omitted flags kept — and NEVER rewrites the name. Refuses a
  // `resource` carrying an `@` selector.
  ensurePermission: (entityId: string, clientId: string, resource?: string, args?: IamPermissionArgs) => Promise<string>

  // Remove definitions BY NAME, and by default their grants. Idempotent ({ found: false } when
  // absent). Grants go first: a crash between the stores must leave a definition with no grants,
  // never grants with no definition. A `managed` definition needs args.managed === true.
  deletePermission: (entityId: string, clientId: string, permission: string | string[], args?: IamPermissionDeleteArgs) => Promise<IamPermissionRemoval[]>

  // Repair definitions whose stored name leaked a gate selector, moving grants in the same write.
  // A rename and a merge — never a delete, never an invention.
  normalizePermissions: (entityId: string, clientId: string, args?: IamNormalizeArgs) => Promise<IamNormalizationReport>

  // Provision a resource and assign it to the tenant's owner role (keycloak). A no-op on the
  // integrated backend, which has no owner role to assign to.
  ensureResourceOwnership: (entityId: string, clientId: string, resource: IamResourceSpec) => Promise<void>

  // --- Authorization (permission definitions & grants) ---

  listPermissions: (entityId: string, clientId: string, filter?: IamPermissionFilter) => Promise<IamPermissionDefinition[]>

  // args.resources selects the resource-scoped form, args.entitySlug the binding of an entityScoped
  // definition; see "Permission model (kinds and grant forms)" in the permissions part. A
  // blanket/all revoke of a declared definition RESTRICTS; mode Inherit takes the own value
  // back — see "Restrictions" there
  grantPermission: (entityId: string, clientId: string, profileId: string, permission: string, args?: IamGrantArgs) => Promise<IamGrant>
  revokePermission: (entityId: string, clientId: string, profileId: string, permission: string, args?: IamGrantArgs) => Promise<void>

  // Grant everything a bundle selects to each subject, idempotently, in ONE read and write per
  // subject. Returns what each subject now holds, not what changed. Use it instead of looping over
  // grantPermission, which costs N·M writes and N·M lost-update windows on the same records.
  grantBundle: (entityId: string, clientId: string, profileIds: string[], bundle: IamGrantBundle) => Promise<IamGrant[]>

  // Direct, default-class and group grants, each with its `origin` — what is HELD; args.restricted
  // adds what the subject's own restrictions withhold (`restricted: true`).
  listGrants: (entityId: string, clientId: string, profileId?: string, args?: IamGrantListArgs) => Promise<IamGrant[]>

  // --- Users of one client — see "Users are per client" ---

  listUsers: (entityId: string, clientId?: string) => Promise<IamUser[]>
  getUser: (entityId: string, clientId: string, profileId: string) => Promise<IamUser | null>
  inviteUser: (entityId: string, clientId: string, invite: IamUserInvite) => Promise<IamUser>
  updateUser: (entityId: string, clientId: string, profileId: string, update: IamUserUpdate) => Promise<IamUser>
  removeUser: (entityId: string, clientId: string, profileId: string) => Promise<void>

  // The owning organization's staff, admitted to the client through the managed `members` group.
  syncStaff: (entityId: string, clientId: string, args: IamStaffSyncArgs) => Promise<IamStaffSyncReport>

  // --- Tenancy facets — see "Organizations, groups and subjects" (the tenancy part) ---
  organizations: IamOrganizationFacet
  groups: IamGroupFacet
  subjects: IamSubjectFacet
}
```

The first parameter of every method is `entityId` — the organization that OWNS the client — and
every `(entityId, clientId)` method verifies that ownership before it reads or writes anything. The
organizations a client's subjects act in are a different thing, named by `entitySlug` inside the
facets.

## Users are per client

A person is ONE account (one per e-mail address); what a client sees of it are its rows of that app —
one per (account, app, organization), the PRIMARY one in the account's own organization. The
`profileId` a client knows is the pairwise subject, the same on every row of one (account, app) and
different for every app, so two apps of one customer cannot correlate their users by it.

- `listUsers(entityId, clientId)` lists every account holding a row of the client, in whichever
  organization. Without `clientId` it is a read-only aggregate over the entity's clients, for a
  console — nothing is written through it.
- `getUser` / `inviteUser` / `updateUser` / `removeUser` take the client. `removeUser` deletes this
  account's rows of THAT app only — the account, and its rows of other apps, stay. `updateUser`
  writes `disabled` on the primary row, which is what refuses the subject at the provider.
- `inviteUser` is idempotent by email, which is what lets an invitation and a first sign-in converge on
  one record instead of accumulating twins.

A backend with no user store of its own — one where the customer manages users in the provider's own
console — throws `IamUnsupported('user-management')` from all five methods.
