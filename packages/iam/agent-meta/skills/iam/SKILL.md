---
name: iam
description: "IamService abstraction for provider-agnostic IAM provisioning. Load when wiring IAM operations, switching IAM mode, or implementing a new IAM provider. Applies to files matching **/services/iam*.ts, **/context.ts, **/types.ts."
metadata:
  applyTo: "**/services/iam*.ts, **/context.ts, **/types.ts"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Using `@owlmeans/iam`

Provider-agnostic IAM abstraction. Defines `IamService` interface and related types. Used by both the platform backend (`viable-backend`) and the agent library (`@owlmeans/viable`). Concrete implementations live in `@owlmeans/iam-keycloak` (full proxy) and `@owlmeans/iam-integrated`.

## Public API surface

| Symbol | Kind | Purpose |
|--------|------|---------|
| `IamService` | type | Unified IAM interface — all provisioning + authorization operations |
| `IamClient` | type | Provisioned OIDC client `{ id?, clientId, secret?, name?, realm? }` |
| `IamClientOptions` | type | `{ redirectUris? }` — explicit `ensureClient` hardening; omitting is a keycloak-only legacy shape (see below) |
| `IamCredentialsPair` | type | `{ token: string; realm: string }` |
| `IamPermissionArgs` | type | `{ permission?, resourceScoped?, title? }` — `permission` absent means unscoped resource name |
| `IamResourceSpec` | type | `{ name: string; displayName?: string }` |
| `IamPermissionDefinition` | type | Declared permission `{ name, resource, action?, resourceScoped?, title? }` |
| `IamGrantArgs` | type | `{ resources?: string[] }` — present = resource-scoped grant form |
| `IamGrant` | type | `{ profileId, clientId, permission, resources? }` |
| `IamUser` | type | End-user of an entity `{ profileId, email?, name?, role, disabled?, grantCount? }` |
| `IamUserInvite` | type | `{ email, name?, role? }` — find-or-create args |
| `IamUserUpdate` | type | `{ name?, role?, disabled? }` |
| `hasPermission` | fn | `(auth, permission, { scope?, resourceId? }?)` — checks `Authorization.permissions` PermissionSet[]; an unscoped set satisfies a resourceId check |
| `DEFAULT_ALIAS` | const | Default service alias `'iam-service'` |
| `IAM_MODE_KEYCLOAK` | const | `'keycloak'` |
| `IAM_MODE_INTEGRATED` | const | `'integrated'` |
| `IamMode` | type | `'keycloak' \| 'integrated'` |
| `IamError` | class | Base IAM error |
| `IamClientError` | class | Thrown when an OIDC client is missing a required field (e.g. `secret`) |
| `IamResourceError` | class | Thrown when a KC resource returns with no name |
| `IamGrantError` | class | Grant subject missing or entity mismatch |
| `IamUnsupported` | class | Operation not supported by the active backend (e.g. resource-scoped grants on Keycloak) |

## Permission model (two grant forms)

Permissions are declared per entity client (project) with `ensurePermission` and granted to end-user
subjects with `grantPermission`:

- **Unscoped (project-wide)**: `grantPermission(entityId, clientId, profileId, 'article--modify')`
- **Resource-scoped**: `grantPermission(entityId, clientId, profileId, 'department--modify', { resources: ['dep-123'] })` —
  the grant only applies to the listed resource ids.

Grants materialize as OwlMeans `PermissionSet[]` (`scope` = clientId; resource-scoped grants live in a
dedicated set per permission carrying `resources[]`, because `resources` applies to all keys of a set).

## `IamService` interface

```ts
interface IamService extends InitializedService {
  // Get the admin OIDC provider config for a tenant (used in payment provisioning, RP config)
  getEntityAdminConfig: (entityId: string) => Promise<OidcProviderConfig>

  // Get an admin { token, realm } pair for raw low-level calls (avoid unless necessary)
  getCredentialsPair: (entityId: string) => Promise<IamCredentialsPair>

  // The tenant's public, fully-qualified OIDC issuer URL — the single value a relying party needs.
  // Config-only (no remote call); throws IamClientError when the provider route is unconfigured.
  getIssuerUrl: (entityId: string) => Promise<string>

  // Provision an OIDC client for a tenant and return its credentials.
  // options.redirectUris hardens the client; always pass them (see "Issuer & redirect URIs").
  // MUST refuse an existing record owned by another entity — see "A client id is a global name".
  ensureClient: (entityId: string, clientId: string, options?: IamClientOptions) => Promise<IamClient>

  // Reserve a free client id without provisioning it; false when anyone else holds it.
  claimClient: (entityId: string, clientId: string) => Promise<boolean>

  // Release a client id and everything keyed by it (called when a project/slot is deleted).
  deleteClient: (entityId: string, clientId: string) => Promise<void>

  // Provision a named permission on a client resource; returns the resource name
  ensurePermission: (entityId: string, clientId: string, resource?: string, args?: IamPermissionArgs) => Promise<string>

  // Provision a resource and assign it to the tenant's owner role (used in payment provisioning)
  ensureResourceOwnership: (entityId: string, clientId: string, resource: IamResourceSpec) => Promise<void>

  // --- Authorization (permission definitions & grants) ---

  // List permission definitions registered for the entity's client
  listPermissions: (entityId: string, clientId: string) => Promise<IamPermissionDefinition[]>

  // Grant a permission to an end-user subject; args.resources = resource-scoped form
  grantPermission: (entityId: string, clientId: string, profileId: string, permission: string, args?: IamGrantArgs) => Promise<IamGrant>

  // Revoke; with args.resources only those ids are removed, else the whole grant
  revokePermission: (entityId: string, clientId: string, profileId: string, permission: string, args?: IamGrantArgs) => Promise<void>

  // List grants for the client, optionally for one subject
  listGrants: (entityId: string, clientId: string, profileId?: string) => Promise<IamGrant[]>

  // --- End-user management (customer-wide users, shared per entityId) ---

  // Every end-user of the entity. clientId scopes the reported grantCount — it does NOT filter.
  listUsers: (entityId: string, clientId?: string) => Promise<IamUser[]>
  getUser: (entityId: string, profileId: string) => Promise<IamUser | null>
  // Find-or-create by email — the one way an end-user record comes into existence.
  inviteUser: (entityId: string, invite: IamUserInvite) => Promise<IamUser>
  updateUser: (entityId: string, profileId: string, update: IamUserUpdate) => Promise<IamUser>
  removeUser: (entityId: string, profileId: string) => Promise<void>
}
```

## End-users are customer-wide

An end-user belongs to the **entity**, not to a project: one customer's users are shared across every
project they own. `listUsers` therefore returns the entity's whole set and `clientId` only scopes the
reported `grantCount` to one project's client. Do not reintroduce a per-client filter — a person who
has authenticated against a project but holds no grant there is still that project's user, and the
screen that hands out grants is exactly where they have to be visible.

`inviteUser` is idempotent by email, which is what lets an invitation and a first sign-in converge on
one record instead of accumulating twins. Backends that have no user store of their own (keycloak,
where the customer manages realm users in its console) throw `IamUnsupported('user-management')` from
all five methods; callers turn that into an "external console" fallback rather than an error.

## A client id is a global name

A provider resolves a client from the bare `client_id` a relying party sends — the adapter gets no
tenant context — so the id is unique across the whole deployment, not per entity, and the store
cannot namespace it on a consumer's behalf. Uniqueness has to be *in the id*.

- Compose it with the owning entity in it. A name derived from a project's own name alone lets two
  organizations share one registration: one secret, one redirect-URI list, one permission-definition
  set, and one grant namespace, because `PermissionSet.scope` is that same string.
- `ensureClient` refuses a record belonging to another entity rather than returning it. The failure
  is deliberate — a loud provisioning error is the only alternative to a silent cross-tenant handover.
- Assign an id **once** and reserve it with `claimClient`. Whatever a consumer derives ids from
  (a project alias, a slug) may later be released and re-used by a sibling, so only the registry can
  say whether an id is free. `deleteClient` gives it back, or a deleted project's name is burned.
- Backends whose clients are already per-tenant (keycloak realms) satisfy this by construction:
  `claimClient` returns true and `deleteClient` may be `IamUnsupported`.

## `IamClient.realm` field

`realm` is set by the provider to the entity ID. Use it instead of accessing internal properties:

```ts
// ✓ correct
await meta.update('oidcRealm', client.realm ?? fallbackEntityId)

// ✗ never do this — internal Keycloak implementation detail
await meta.update('oidcRealm', (client as any)._realm)
```

## Issuer & redirect URIs

**`getIssuerUrl(entityId)` is the only place an issuer URL may be composed.** Consumers pass the
result straight through as `OidcProviderDescriptor.discoveryUrl`; they must never rebuild it from a
host plus a base path. Each backend owns its own shape (keycloak `{iam-host}/realms/{entityId}`,
integrated `{provider-host}/{basePath}`), and an implementation must:

- resolve it from configuration only — no admin round-trip, so a consumer that just needs the issuer
  never pays for or fails on a token grant;
- return exactly what the provider advertises as `issuer` (`openid-client` compares the two and fails
  discovery on any difference — build it with the same `makeUrl(..., { base: true })` call
  `@owlmeans/server-oidc-provider` uses);
- throw `IamClientError` when the provider's service route is missing, never fall back silently.

`getEntityAdminConfig` additionally carries the same value as `discoveryUrl`, so the admin provider
config is self-sufficient too.

**Always pass `redirectUris`.** Omitting them is a keycloak-only legacy default (`['*']`, which
Keycloak expands per-origin). The integrated provider does exact `redirect_uri` matching and
`oidc-provider` refuses to load a client whose `redirect_uris` are not absolute URIs — so
`iam-integrated.ensureClient` throws `IamClientError('redirect-uris')` on creation rather than
registering a client that can never complete a callback. An omitted list never widens an existing
hardened client.

## Selecting the IAM provider

The platform wires the correct implementation via the `IAM_MODE` environment variable. The default is **`integrated`** (the internal IAM); `IAM_MODE=keycloak` is opt-in, used mainly for custom / standalone customer production setups. Do not read `IAM_MODE` directly from feature code — it belongs in the service-factory only (the platform exposes `resolveIamMode()` / `isIntegratedIam()` from `viable-common`):

```ts
export const makeIamService = (mode = resolveIamMode()) => {
  if (mode === IAM_MODE_KEYCLOAK) return makeIamKeycloakService(VIABLE_IAM, { oidcProductAlias: OIDC_PRODUCT })
  // Pass the consumer's OWN service alias + base path: the package defaults ('manager-api',
  // '/oidc') are placeholders, and a mismatch makes every cfg.services[...] lookup miss.
  return makeIamIntegratedService(VIABLE_IAM, {
    providerServiceAlias: MANAGER_API, providerBasePath: IAM_PROVIDER_BASE_PATH,
  })
}
```

When a context hosts **more than one** `IamService` instance (the viable agent registers both
`viable-backend`'s and the agent library's), every instance must be constructed with the same
options — otherwise they disagree about the issuer.

## Rules

- Always depend on `IamService` from `@owlmeans/iam`, not on `KeycloakApiService` directly.
- Do not expose `getCredentialsPair` to request handlers — it returns a raw admin token.
- `IamClientError` means the provisioned client was invalid (missing secret, null token). The proxy already throws it; callers only need to handle it, not re-throw wrapped errors.
- The `realm` field on `IamClient` is guaranteed to be set by all concrete implementations.

## Related instructions

- `@owlmeans/iam-keycloak` (internal) — full proxy over Keycloak; see the `iam-keycloak` skill
- `@owlmeans/keycloak` (internal) — low-level KC admin API; see the `keycloak` skill
- `@owlmeans/server-iam` — IAM gate asserting both grant forms; see the `server-iam` skill
