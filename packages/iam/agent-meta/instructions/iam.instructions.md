---
description: "IamService abstraction for provider-agnostic IAM provisioning. Load when wiring IAM operations, switching IAM mode, or implementing a new IAM provider."
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
  ensureClient: (entityId: string, clientId: string, options?: IamClientOptions) => Promise<IamClient>

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
}
```

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

- `@owlmeans/iam-keycloak` (internal) — full proxy over Keycloak; see `iam-keycloak.instructions.md`
- `@owlmeans/keycloak` (internal) — low-level KC admin API; see `keycloak.instructions.md`
- `@owlmeans/server-iam` — IAM gate asserting both grant forms; see `server-iam.instructions.md`
