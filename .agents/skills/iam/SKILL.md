---
name: iam
description: "How to use @owlmeans/iam — the provider-agnostic IamService, the permission-definition model with its four kinds (unbound, entity-bound, resource-bound, both) and default classes, the organization/group/subject facets, the runtime IAM API declarations, client-id uniqueness, issuer and redirect-URI rules, and hasPermission. Load when wiring IAM operations, granting or revoking permissions, working with tenanted clients, selecting the IAM backend, or implementing a new IAM provider. Applies to files matching **/services/iam*.ts, **/context.ts, **/types.ts."
metadata:
  applyTo: "**/services/iam*.ts, **/context.ts, **/types.ts"
---

# Using `@owlmeans/iam`

**Install:** `"@owlmeans/iam": "^0.1.18-rc.55"` in `dependencies`

Provider-agnostic IAM abstraction: the `IamService` interface, the permission and grant shapes, the
gate-param grammar, `hasPermission`, and the declarations of the provider's runtime IAM API. It
contains no implementation and talks to no provider —
concrete backends (a Keycloak proxy, an integrated backend built on the OwlMeans OIDC provider) are
separate packages, and every consumer depends on this interface rather than on one of them.

## Where the halves live

This package is contracts only. The browser half — `appendIam`, the session's organizations and the
switch, `hasPermission` re-exported — is `@owlmeans/client-iam` (`client-iam` skill); the server half
— the IAM gate, the session's organizations on the server and the runtime IAM client — is
`@owlmeans/server-iam` (`server-iam` skill). Permission decisions are made on the server, never in
the browser.

## Public API surface

| Symbol | Kind | Purpose |
|--------|------|---------|
| `IamService` | type | Unified IAM interface — all provisioning + authorization operations |
| `IamClient` | type | Provisioned OIDC client `{ id?, clientId, secret?, name?, realm?, config? }` |
| `IamClientInfo` | type | `IamClient` without `secret` — what `getClient` answers |
| `IamClientConfig` | type | `{ operators?, users?, [key]: unknown }` — the two tenancy flags plus the client's arbitrary configuration |
| `IamClientOptions` | type | `{ redirectUris?, config? }` — explicit `ensureClient` hardening (omitting `redirectUris` is a keycloak-only legacy shape, see the `clients` part); `config` merges shallowly |
| `IamCredentialsPair` | type | `{ token: string; realm: string }` |
| `IamPermissionArgs` | type | `{ permission?, resourceScoped?, entityScoped?, title?, area?, managed?, defaultClass? }` — `permission` absent means unscoped resource name; omitted flags are kept, passed ones (`false` / `None` included) written |
| `IamResourceSpec` | type | `{ name: string; displayName?: string }` |
| `IamPermissionDefinition` | type | Declared permission `{ name, resource, action?, resourceScoped?, entityScoped?, title?, area?, managed?, defaultClass? }` |
| `IamPermissionFilter` | type | `{ areas?, managed?, resourceScoped?, entityScoped? }` — narrows `listPermissions`; an `areas` entry of `null` matches untagged definitions |
| `IamDefaultClass` | enum | `None` / `User` / `Member` / `Owner` — who holds a definition without a grant (see "Permission kinds" in the `permissions` part) |
| `IamGrantArgs` | type | `{ resources?, mode?, entitySlug? }` — `entitySlug` binds an `entityScoped` grant |
| `IamGrant` | type | `{ profileId? \| group?, clientId, permission, resources?, mode?, entitySlug?, origin?, through?, restricted? }` — exactly one subject; `restricted: true` only in a listing that asked for it (withheld, not held) |
| `IamGrantListArgs` | type | `{ restricted? }` — `listGrants` / `groups.grants` also list what the subject's own restriction withholds |
| `IamGrantOrigin` | enum | `Direct` / `Default` / `Group` / `Bundle` — why a listed grant is held; `through` names the group; `Bundle` only in a group's own listing |
| `IamGroupRef` | type | `{ entitySlug, key }` — a group by its organization's slug and its key |
| `IamGrantMode` | enum | `Blanket` / `Resources` / `All` / `Inherit` — which FORM of a grant an operation addresses; `All` and `Inherit` are revoke-only |
| `IamGrantBundle` | type | `{ filter?, permissions?, mode?, resources?, entitySlug? }` — what `grantBundle` hands out |
| `IamRemovalPolicy` | enum | `Cascade` / `Refuse` — what to do about grants of a definition being deleted |
| `IamPermissionDeleteArgs`, `IamPermissionRemoval` | type | `{ policy?, managed? }` and `{ permission, clientId, found, revoked }` |
| `IamNormalizeArgs`, `IamNormalizationReport` | type | `{ dryRun? }` and the rename/merge plan `normalizePermissions` reports |
| `IAM_AREAS`, `IamArea` | const/type | `['user', 'operator', 'admin']` — presentational grouping tags, read by no gate |
| `PERMISSION_ACTION_SEPARATOR` | const | `'--'` — TWO hyphens, never one |
| `parsePermissionName` / `composePermissionName` / `isPermissionName` | fn | Read, build and validate a permission NAME |
| `ParsedPermissionName` | type | `{ name, resource, action?, problem? }` |
| `IamUser` | type | Subject of one client `{ profileId, email?, name?, role, disabled?, grantCount?, home?, memberships? }` |
| `IamMembershipInfo` | type | `{ entitySlug, title?, owner, groups, home? }` — one organization of an `IamUser` |
| `IamUserInvite` | type | `{ email, name?, role? }` — find-or-create args |
| `IamUserUpdate` | type | `{ name?, role?, disabled? }` — `disabled` lands on the primary row |
| `IamOrganization`, `IamOrganizationArgs`, `IamOrganizationUpdate` | type | `{ entitySlug, title?, members? }`; create `{ title?, profileId? }` (the new owner); update `{ title }` |
| `IamMember`, `IamMemberInvite`, `IamMemberUpdate` | type | `{ profileId, email?, name?, owner, groups, managed? }`; `{ email, name?, owner? }`; `{ owner?, groups? }` |
| `IamGroup`, `IamGroupArgs`, `IamGroupBundle` | type | `{ entitySlug, key, title?, managed?, members?, bundles }`; `{ title?, bundles? }`; `{ filter?, permissions? }` |
| `IamStaffSyncArgs`, `IamStaffSyncReport` | type | `{ bundles }` and `{ added, removed }` (profile ids) of `syncStaff` |
| `IamSubject`, `IamSignInArgs`, `IamSignInResult` | type | `{ profileId, email?, name?, organizations, permissions }` (claims input); `{ email, name? }`; `{ accountId, profileId }` |
| `IamOrganizationFacet`, `IamGroupFacet`, `IamSubjectFacet` | type | The three facets of `IamService` |
| `unsupportedFacet<T>(what)` | fn | A facet whose every method throws `IamUnsupported(what)` — synchronously |
| `IAM_MEMBERS_GROUP` | const | `'members'` — the managed staff group `syncStaff` keeps (structure the sync's, permissions the operator's) |
| `IAM_EMAIL_PROOF` | const | `'proof:email'` — the `profileId` of a credential that proves an address and identifies nobody yet |
| `hasPermission` | fn | `(auth, permission, { scope?, resourceId?, entitySlug? }?)` — checks `Authorization.permissions`; an unscoped set satisfies a resourceId check, an unbound set any organization |
| `HasPermissionOptions` | type | `{ scope?, resourceId?, entitySlug? }` |
| `makeIamRuntimeProtocols({ service, path? })` | fn | The runtime IAM API's protocol tree — see "Runtime IAM API" in the `tenancy` part |
| `IAM_RUNTIME_GUARD`, `IAM_RUNTIME_PATH`, `IAM_RUNTIME_ROUTES` | const | Its guard alias, default base path (`'/runtime'`) and leaf-path table |
| `IamRuntime*` | type/schema | Its wire shapes and closed schemas (`IamRuntimeOrganization`, `IamRuntimeMember`, `IamRuntimePermission`, `IamRuntimeGrant`, `IamRuntimeGrantRequest`, … and `*Schema`) |
| Gate grammar | fn/type | `parseGateParam`, `parseGateSelector`, `formatGateParam`, `resolveGateResource`, `validateGateParams`, `routeParamsOf`, plus `RESOURCE_*_SEPARATOR`, `GateParamSource`, `DEFAULT_GATE_PARAM_SOURCES`, `GateParamErrorCode`, `GateResolutionFailure` and the `Gate*` types. The syntax itself is documented in the `server-iam` skill |
| `DEFAULT_ALIAS` | const | Default service alias `'iam-service'` |
| `IAM_MODE_KEYCLOAK` | const | `'keycloak'` |
| `IAM_MODE_INTEGRATED` | const | `'integrated'` |
| `IamMode` | type | `'keycloak' \| 'integrated'` |
| `IamError` | class | Base IAM error |
| `IamClientError` | class | An OIDC client is invalid or unusable — missing `secret`, unusable `redirect_uris`, `client:entity-mismatch`, an unconfigured provider route |
| `IamResourceError` | class | A provider resource returned with no name |
| `IamGrantError` | class | Grant subject missing or entity mismatch |
| `IamPermissionError` | class | A refusal about a DEFINITION: `permission:held:<name>`, `permission:managed:<name>` |
| `IamUserError` | class | An end-user operation was refused |
| `IamOrganizationError` | class | An organization or membership refusal — unknown organization, last owner, membership cap |
| `IamGroupError` | class | A group refusal — unknown key, an operator writing a managed group's structure, another app's group |
| `IamUnsupported` | class | Operation not supported by the active backend (e.g. `resource-scoped-grant`, `user-management`) |

## Rules

- Always depend on `IamService`, never on a backend's own admin client.
- Do not expose `getCredentialsPair` to request handlers — it returns a raw admin token.
- `IamClientError` means the provisioned client was invalid (missing secret, null token). The adapter
  already throws it; callers handle it rather than re-throwing a wrapped error.
- An operation a backend cannot support throws `IamUnsupported('<what>')`; a whole facet it cannot
  support is `unsupportedFacet(what)`. Callers turn that into a fallback — an "external console"
  link, a disabled control — rather than an error screen.
- A wire value names an organization by `entitySlug` only; the `entityId` parameter is the client's
  OWNER, resolved server-side, never taken from a token or a request.

## Related

- `@owlmeans/server-iam` — the IAM gate that asserts every permission kind, the gate-param grammar,
  the session's organizations and the runtime IAM client; see the `server-iam` skill
- `@owlmeans/client-iam` — browser wiring, the organization switch and `hasPermission`; see the
  `client-iam` skill
- `@owlmeans/oidc` — provider descriptors and the `iamMode` config seam; see the `oidc` skill
- The concrete adapters (a Keycloak proxy, and the integrated backend built on
  `@owlmeans/server-oidc-provider` plus `@owlmeans/server-auth-identity`) ship separately and are
  reached only through `IamService`.

## Parts

| Part | Load it when |
|---|---|
| [permissions](parts/permissions.md) | declaring, granting, revoking or checking a permission, or reasoning about what a subject holds |
| [service](parts/service.md) | calling IamService methods, or implementing a new IAM provider |
| [tenancy](parts/tenancy.md) | working with tenanted clients, organizations, members or groups, or the runtime IAM API |
| [clients](parts/clients.md) | provisioning a client, composing an issuer URL, or choosing between the integrated and Keycloak backends |
