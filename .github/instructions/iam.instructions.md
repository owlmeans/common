---
description: "IamService abstraction for provider-agnostic IAM provisioning. Load when wiring IAM operations, switching IAM mode, or implementing a new IAM provider."
applyTo: "**/services/iam*.ts, **/context.ts, **/types.ts"
---

# Using `@owlmeans/iam`

Provider-agnostic IAM abstraction. Defines `IamService` interface and related types. Used by both the platform backend (`viable-backend`) and the agent library (`@owlmeans/viable`). Concrete implementations live in `@owlmeans/iam-keycloak` (full proxy) and `@owlmeans/iam-integrated` (Phase 2 skeleton).

## Public API surface

| Symbol | Kind | Purpose |
|--------|------|---------|
| `IamService` | type | Unified IAM interface — all provisioning operations |
| `IamClient` | type | Provisioned OIDC client `{ id?, clientId, secret?, name?, realm? }` |
| `IamCredentialsPair` | type | `{ token: string; realm: string }` |
| `IamPermissionArgs` | type | `{ permission?: string }` — absent means unscoped |
| `IamResourceSpec` | type | `{ name: string; displayName?: string }` |
| `DEFAULT_ALIAS` | const | Default service alias `'iam-service'` |
| `IAM_MODE_KEYCLOAK` | const | `'keycloak'` |
| `IAM_MODE_INTEGRATED` | const | `'integrated'` |
| `IamMode` | type | `'keycloak' \| 'integrated'` |
| `IamError` | class | Base IAM error |
| `IamClientError` | class | Thrown when an OIDC client is missing a required field (e.g. `secret`) |
| `IamResourceError` | class | Thrown when a KC resource returns with no name |

## `IamService` interface

```ts
interface IamService extends InitializedService {
  // Get the admin OIDC provider config for a tenant (used in payment provisioning, RP config)
  getEntityAdminConfig: (entityId: string) => Promise<OidcProviderConfig>

  // Get an admin { token, realm } pair for raw low-level calls (avoid unless necessary)
  getCredentialsPair: (entityId: string) => Promise<IamCredentialsPair>

  // Provision an OIDC client for a tenant and return its credentials
  ensureClient: (entityId: string, clientId: string) => Promise<IamClient>

  // Provision a named permission on a client resource; returns the resource name
  ensurePermission: (entityId: string, clientId: string, resource?: string, args?: IamPermissionArgs) => Promise<string>

  // Provision a resource and assign it to the tenant's owner role (used in payment provisioning)
  ensureResourceOwnership: (entityId: string, clientId: string, resource: IamResourceSpec) => Promise<void>
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

## Selecting the IAM provider

The platform wires the correct implementation via `IAM_MODE` environment variable. Default is `'keycloak'`. Do not read `IAM_MODE` directly from feature code — it belongs in the service-factory only:

```ts
export const makeIamService = (mode = process.env.IAM_MODE ?? 'keycloak') => {
  if (mode === 'integrated') return makeIamIntegratedService(VIABLE_IAM)
  return makeIamKeycloakService(VIABLE_IAM, { oidcProductAlias: OIDC_PRODUCT })
}
```

## Rules

- Always depend on `IamService` from `@owlmeans/iam`, not on `KeycloakApiService` directly.
- Do not expose `getCredentialsPair` to request handlers — it returns a raw admin token.
- `IamClientError` means the provisioned client was invalid (missing secret, null token). The proxy already throws it; callers only need to handle it, not re-throw wrapped errors.
- The `realm` field on `IamClient` is guaranteed to be set by all concrete implementations.

## Related instructions

- `@owlmeans/iam-keycloak` (internal) — full proxy over Keycloak; see `iam-keycloak.instructions.md`
- `@owlmeans/keycloak` (internal) — low-level KC admin API; see `keycloak.instructions.md`
