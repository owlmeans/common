---
name: iam
description: "How to use @owlmeans/iam — the provider-agnostic IamService, the permission-definition and two-form grant model, client-id uniqueness, issuer and redirect-URI rules, and hasPermission. Load when wiring IAM operations, granting or revoking permissions, selecting the IAM backend, or implementing a new IAM provider. Applies to files matching **/services/iam*.ts, **/context.ts, **/types.ts."
metadata:
  applyTo: "**/services/iam*.ts, **/context.ts, **/types.ts"
---

# Using `@owlmeans/iam`

**Install:** `"@owlmeans/iam": "^0.1.18-rc.15"` in `dependencies`

Provider-agnostic IAM abstraction: the `IamService` interface, the permission and grant shapes, the
gate-param grammar, and `hasPermission`. It contains no implementation and talks to no provider —
concrete backends (a Keycloak proxy, an integrated backend built on the OwlMeans OIDC provider) are
separate packages, and every consumer depends on this interface rather than on one of them.

## The browser half — `@owlmeans/client-iam`

`@owlmeans/client-iam` has no skill of its own because it is a wiring package: it re-exports these
types and `hasPermission`, and adds the two calls that turn "this application uses IAM" into two
lines.

| Export | Description |
|--------|-------------|
| `appendIam(context, opts?)` | Wires the OIDC guard onto a web context **and** installs the consent-before-sign-in precondition |
| `setupIam(entrypoints, coguards?)` | Wires the same guard onto the entrypoint list, and attaches the dispatcher screen |
| `requireConsentForLogin(ctx, opts?)` | That precondition on its own, for a context wired some other way |
| `CONSENT_LOGIN_PRECONDITION` / `CLIENT_IAM_SERVICE` | The precondition alias and the service alias |
| `useLogin` / `useLogout`, `LoginOutcome` / `LoginIntent`, `LoginPlugin` / `LoginService` / … | Re-exported sign-in surface, so an app has one IAM import rather than three |
| Everything from `@owlmeans/iam` | The types above, plus `hasPermission` |

Two rules ride on it. **`setupIam` is called exactly once per entrypoint list** — it appends the OIDC
dispatcher entrypoints to the list it is given rather than returning a new one, and then elevates
three aliases in place. **Calling it twice fails silently, it does not throw.** Elevation is
idempotent: it replaces the *first* element carrying the alias and only raises when the alias is
absent (`Entrypoint with alias … not present`, which a list missing the `DISPATCHER` declaration
hits). So a second `setupIam` — or a `setupOidcGuard` from `@owlmeans/web-oidc-rp` called alongside
it — leaves the same declarations in the list twice and re-elevates them, with no error and no
warning, and the dispatcher screen ends up as whatever the later call attached: a parametrised
dispatcher is quietly swapped for the default. An app that calls `setupIam` must therefore not also
call `setupOidcGuard` itself.

And the consent precondition sits on `LoginService.begin` rather than on a hook, a screen or a login
plugin, because `begin` is the single funnel every sign-in mechanic passes through and the one place
the user's gesture is still live — a refusal resolves as `LoginOutcome.Gesture` and opens the consent dialog in
the same gesture. An application that genuinely sets no cookie passes `{ consent: { disabled: true } }`.

The server half of the same story is `@owlmeans/server-iam` — the IAM gate that asserts the grants
this package's screens hand out. Permission decisions are made there, never in the browser.

## Public API surface

| Symbol | Kind | Purpose |
|--------|------|---------|
| `IamService` | type | Unified IAM interface — all provisioning + authorization operations |
| `IamClient` | type | Provisioned OIDC client `{ id?, clientId, secret?, name?, realm? }` |
| `IamClientOptions` | type | `{ redirectUris? }` — explicit `ensureClient` hardening; omitting is a keycloak-only legacy shape (see below) |
| `IamCredentialsPair` | type | `{ token: string; realm: string }` |
| `IamPermissionArgs` | type | `{ permission?, resourceScoped?, title?, area?, managed? }` — `permission` absent means unscoped resource name |
| `IamResourceSpec` | type | `{ name: string; displayName?: string }` |
| `IamPermissionDefinition` | type | Declared permission `{ name, resource, action?, resourceScoped?, title?, area?, managed? }` |
| `IamPermissionFilter` | type | `{ areas?, managed?, resourceScoped? }` — narrows `listPermissions`; an `areas` entry of `null` matches untagged definitions |
| `IamGrantArgs` | type | `{ resources?: string[], mode? }` |
| `IamGrant` | type | `{ profileId, clientId, permission, resources?, mode? }` |
| `IamGrantMode` | enum | `Blanket` / `Resources` / `All` — which FORM of a grant an operation addresses |
| `IamGrantBundle` | type | `{ filter?, permissions?, mode?, resources? }` — what `grantBundle` hands out |
| `IamRemovalPolicy` | enum | `Cascade` / `Refuse` — what to do about grants of a definition being deleted |
| `IamPermissionDeleteArgs`, `IamPermissionRemoval` | type | `{ policy?, managed? }` and `{ permission, clientId, found, revoked }` |
| `IamNormalizeArgs`, `IamNormalizationReport` | type | `{ dryRun? }` and the rename/merge plan `normalizePermissions` reports |
| `IAM_AREAS`, `IamArea` | const/type | `['user', 'operator', 'admin']` — presentational grouping tags, read by no gate |
| `PERMISSION_ACTION_SEPARATOR` | const | `'--'` — TWO hyphens, never one |
| `parsePermissionName` / `composePermissionName` / `isPermissionName` | fn | Read, build and validate a permission NAME |
| `ParsedPermissionName` | type | `{ name, resource, action?, problem? }` |
| `IamUser` | type | End-user of an entity `{ profileId, email?, name?, role, disabled?, grantCount? }` |
| `IamUserInvite` | type | `{ email, name?, role? }` — find-or-create args |
| `IamUserUpdate` | type | `{ name?, role?, disabled? }` |
| `hasPermission` | fn | `(auth, permission, { scope?, resourceId? }?)` — checks `Authorization.permissions` PermissionSet[]; an unscoped set satisfies a resourceId check |
| `HasPermissionOptions` | type | `{ scope?, resourceId? }` |
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
| `IamUnsupported` | class | Operation not supported by the active backend (e.g. `resource-scoped-grant`, `user-management`) |

## Permission model (two grant forms)

Permissions are declared per entity client (project) with `ensurePermission` and granted to end-user
subjects with `grantPermission`:

- **Unscoped (project-wide)**: `grantPermission(entityId, clientId, profileId, 'article--modify')`
- **Resource-scoped**: `grantPermission(entityId, clientId, profileId, 'department--modify', { resources: ['dep-123'] })` —
  the grant only applies to the listed resource ids.

Grants materialize as OwlMeans `PermissionSet[]` (`scope` = clientId; resource-scoped grants live in a
dedicated set per permission carrying `resources[]`, because `resources` applies to all keys of a set).

A **name** is `<resource>--<action>`, with two hyphens. One hyphen is not a separator: `enquiry-view`
is a resource named `enquiry-view` with no action, and it must keep parsing that way, because a name
already granted somewhere cannot be reinterpreted without orphaning the grant. Build and read names
through `composePermissionName` / `parsePermissionName` rather than splitting strings.

`resourceScoped: true` says a permission *may* be bound to resource ids, not that it must be. The
same name is grantable in both forms and they are stored separately, which is what `IamGrantMode`
addresses: `Blanket` is the set carrying no `resources` (and `hasPermission` reads it as covering
every id), `Resources` is an explicit id list, and `All` is revoke-only. The defaults are asymmetric
on purpose — `grantPermission` defaults to `Blanket`, `revokePermission` to `All`, because a bare
revoke has always meant "remove it everywhere". Pass `mode` explicitly rather than relying on either.

`area` is a presentational grouping tag (`IAM_AREAS`, or any string a deployment defines) and decides
nothing at request time. `managed: true` marks a definition the platform owns: an operator cannot
revoke it from an undifferentiated list, and a repair that deletes "definitions no declaration names"
must not reach one.

## `IamService` interface

```ts
interface IamService extends InitializedService {
  // The tenant's admin OIDC provider config, and a raw admin { token, realm } pair.
  getEntityAdminConfig: (entityId: string) => Promise<OidcProviderConfig>
  getCredentialsPair: (entityId: string) => Promise<IamCredentialsPair>

  // The tenant's public issuer URL — see "Issuer & redirect URIs".
  getIssuerUrl: (entityId: string) => Promise<string>

  // Provision an OIDC client for a tenant — see "Issuer & redirect URIs" and
  // "A client id is a global name" for the two rules it has to obey.
  ensureClient: (entityId: string, clientId: string, options?: IamClientOptions) => Promise<IamClient>

  // Reserve a free client id without provisioning it; false when anyone else holds it.
  claimClient: (entityId: string, clientId: string) => Promise<boolean>

  // Release a client id and everything keyed by it (called when a project/slot is deleted).
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

  // Provision a resource and assign it to the tenant's owner role
  ensureResourceOwnership: (entityId: string, clientId: string, resource: IamResourceSpec) => Promise<void>

  // --- Authorization (permission definitions & grants) ---

  listPermissions: (entityId: string, clientId: string, filter?: IamPermissionFilter) => Promise<IamPermissionDefinition[]>

  // args.resources selects the resource-scoped form; see "Permission model (two grant forms)"
  grantPermission: (entityId: string, clientId: string, profileId: string, permission: string, args?: IamGrantArgs) => Promise<IamGrant>
  revokePermission: (entityId: string, clientId: string, profileId: string, permission: string, args?: IamGrantArgs) => Promise<void>

  // Grant everything a bundle selects to each subject, idempotently, in ONE read and write per
  // subject. Returns what each subject now holds, not what changed. Use it instead of looping over
  // grantPermission, which costs N·M writes and N·M lost-update windows on the same records.
  grantBundle: (entityId: string, clientId: string, profileIds: string[], bundle: IamGrantBundle) => Promise<IamGrant[]>

  listGrants: (entityId: string, clientId: string, profileId?: string) => Promise<IamGrant[]>

  // --- End-user management — see "End-users are customer-wide" ---

  listUsers: (entityId: string, clientId?: string) => Promise<IamUser[]>
  getUser: (entityId: string, profileId: string) => Promise<IamUser | null>
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
one record instead of accumulating twins. A backend with no user store of its own — one where the
customer manages users in the provider's own console — throws `IamUnsupported('user-management')`
from all five methods.

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

`realm` is set by the provider to the entity id, so read `client.realm ?? fallbackEntityId` and never
reach into an adapter's own internals (`(client as any)._realm`) for the same value.

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
`oidc-provider` refuses to load a client whose `redirect_uris` are not absolute URIs — so an
integrated backend's `ensureClient` throws `IamClientError('redirect-uris')` on creation rather than
registering a client that can never complete a callback. An omitted list never widens an existing
hardened client.

## Selecting the IAM backend

The choice is made **once, in a service factory**, and nowhere else. Feature code depends on
`IamService` and never learns which implementation answers it. `IAM_MODE_INTEGRATED` /
`IAM_MODE_KEYCLOAK` and `OidcIamConfig.iamMode` (`@owlmeans/oidc`) exist so a deployment can carry
that choice as ordinary configuration rather than as a branch scattered through handlers. No OwlMeans
package reads `iamMode`; it is declared for the consumer's own factory to switch on, which is the
only thing that may branch.

```ts
import { DEFAULT_ALIAS, IAM_MODE_INTEGRATED, IAM_MODE_KEYCLOAK } from '@owlmeans/iam'
import type { IamMode, IamService } from '@owlmeans/iam'

// makeKeycloakAdapter / makeIntegratedAdapter are PLACEHOLDER names standing in for whichever
// adapter packages the deployment installs — this factory is the one place either is named, and
// every consumer resolves IamService by alias instead. An adapter exposes a
// `(alias?: string, options?: object) => IamService` factory whose alias defaults to DEFAULT_ALIAS.
export const makeIamService = (mode: IamMode = IAM_MODE_INTEGRATED): IamService =>
  mode === IAM_MODE_KEYCLOAK
    ? makeKeycloakAdapter(DEFAULT_ALIAS, /* adapter options */)
    : makeIntegratedAdapter(DEFAULT_ALIAS, /* adapter options */)

// cfg.oidc typed as OidcSharedConfig & OidcIamConfig is what carries the mode
context.registerService(makeIamService(cfg.oidc?.iamMode))
```

An adapter that reassembles the issuer from a registered service alias plus a base path must be given
the **consumer's own** alias and path. Whatever an adapter defaults to is a placeholder, and a
mismatch makes every service lookup behind `getIssuerUrl` miss.

An integrated backend — one built on `@owlmeans/server-oidc-provider`, so the deployment hosts its
own provider — is the default choice; a Keycloak-backed adapter exists for deployments that already
run one.

When a context hosts **more than one** `IamService` instance, every instance must be constructed with
the same options — otherwise they disagree about the issuer, and only one of them can be right.

## Rules

- Always depend on `IamService`, never on a backend's own admin client.
- Do not expose `getCredentialsPair` to request handlers — it returns a raw admin token.
- `IamClientError` means the provisioned client was invalid (missing secret, null token). The adapter
  already throws it; callers handle it rather than re-throwing a wrapped error.
- `IamClient.realm` is set by every concrete implementation.
- An operation a backend cannot support throws `IamUnsupported('<what>')`. Callers turn that into a
  fallback — an "external console" link, a disabled control — rather than an error screen.

## Related

- `@owlmeans/server-iam` — the IAM gate that asserts both grant forms, and the gate-param grammar;
  see the `server-iam` skill
- `@owlmeans/oidc` — provider descriptors and the `iamMode` config seam; see the `oidc` skill
- The concrete adapters (a Keycloak proxy, and the integrated backend built on
  `@owlmeans/server-oidc-provider` plus `@owlmeans/server-auth-identity`) ship separately and are
  reached only through `IamService`.
