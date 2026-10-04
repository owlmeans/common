---
name: iam
description: "How to use @owlmeans/iam — the provider-agnostic IamService, the permission-definition model with its four kinds (unbound, entity-bound, resource-bound, both) and default classes, the organization/group/subject facets, the runtime IAM API declarations, client-id uniqueness, issuer and redirect-URI rules, and hasPermission. Load when wiring IAM operations, granting or revoking permissions, working with tenanted clients, selecting the IAM backend, or implementing a new IAM provider. Applies to files matching **/services/iam*.ts, **/context.ts, **/types.ts."
metadata:
  applyTo: "**/services/iam*.ts, **/context.ts, **/types.ts"
---

# Using `@owlmeans/iam`

**Install:** `"@owlmeans/iam": "^0.1.18-rc.48"` in `dependencies`

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
| `IamClientOptions` | type | `{ redirectUris?, config? }` — explicit `ensureClient` hardening (omitting `redirectUris` is a keycloak-only legacy shape, see below); `config` merges shallowly |
| `IamCredentialsPair` | type | `{ token: string; realm: string }` |
| `IamPermissionArgs` | type | `{ permission?, resourceScoped?, entityScoped?, title?, area?, managed?, defaultClass? }` — `permission` absent means unscoped resource name; omitted flags are kept, passed ones (`false` / `None` included) written |
| `IamResourceSpec` | type | `{ name: string; displayName?: string }` |
| `IamPermissionDefinition` | type | Declared permission `{ name, resource, action?, resourceScoped?, entityScoped?, title?, area?, managed?, defaultClass? }` |
| `IamPermissionFilter` | type | `{ areas?, managed?, resourceScoped?, entityScoped? }` — narrows `listPermissions`; an `areas` entry of `null` matches untagged definitions |
| `IamDefaultClass` | enum | `None` / `User` / `Member` / `Owner` — who holds a definition without a grant (see "Permission kinds") |
| `IamGrantArgs` | type | `{ resources?, mode?, entitySlug? }` — `entitySlug` binds an `entityScoped` grant |
| `IamGrant` | type | `{ profileId? \| group?, clientId, permission, resources?, mode?, entitySlug?, origin?, through? }` — exactly one subject |
| `IamGrantOrigin` | enum | `Direct` / `Default` / `Group` — why a listed grant is held; `through` names the group |
| `IamGroupRef` | type | `{ entitySlug, key }` — a group by its organization's slug and its key |
| `IamGrantMode` | enum | `Blanket` / `Resources` / `All` — which FORM of a grant an operation addresses |
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
| `IAM_MEMBERS_GROUP` | const | `'members'` — the managed staff group `syncStaff` keeps |
| `IAM_EMAIL_PROOF` | const | `'proof:email'` — the `profileId` of a credential that proves an address and identifies nobody yet |
| `hasPermission` | fn | `(auth, permission, { scope?, resourceId?, entitySlug? }?)` — checks `Authorization.permissions`; an unscoped set satisfies a resourceId check, an unbound set any organization |
| `HasPermissionOptions` | type | `{ scope?, resourceId?, entitySlug? }` |
| `makeIamRuntimeProtocols({ service, path? })` | fn | The runtime IAM API's protocol tree — see "Runtime IAM API" |
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
| `IamGroupError` | class | A group refusal — unknown key, a managed group written by an operator, another app's group |
| `IamUnsupported` | class | Operation not supported by the active backend (e.g. `resource-scoped-grant`, `user-management`) |

## Permission model (kinds and grant forms)

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

### Permission kinds

What a grant binds to is a property of the DEFINITION, and grants follow it:

| Kind | Definition flags | Grant stored on | Applies |
|---|---|---|---|
| unbound | none | the subject's primary row, or a group | everywhere |
| entity-bound | `entityScoped` | the subject's row of THAT organization, or a group of it | only while acting in that organization |
| resource-bound | `resourceScoped` | the primary row, a titled set with `resources` | to those resource ids |
| both | both | that organization's row, a titled set with `resources` | both checks |

- Granting an `entityScoped` definition REQUIRES `args.entitySlug`, which names the subject's row
  there — the subject must be a member. Any other definition refuses `args.entitySlug`. Turning
  `entityScoped` off while grants exist is refused: every bound grant would silently widen.
- Stored sets carry the organization's id; CLAIM sets (provider → relying party only) carry its
  `entitySlug` instead (`OidcPermissionSetClaim`). The relying party keeps the unbound sets and the
  acting organization's, strips the binding, and drops the rest — a browser token never carries a
  bound set of another organization.
- `hasPermission(auth, name, { entitySlug })` applies a set without `entitySlug` everywhere and a
  bound one only when `opts.entitySlug` names its organization — fail-closed, so a bound set that
  leaked into a token never counts where the caller named no organization.

### Default classes

`defaultClass` says who holds a definition without an explicit grant. It is evaluated when claims and
grant listings are built — never written onto a row:

- `User` — every signed-in subject of the client. Requires an unbound, unmanaged `user`-area definition.
- `Member` / `Owner` — every member / owner of the organization the subject acts in. Requires
  `entityScoped`.
- `None` — nobody.

A class default is a BLANKET set, so `Owner` on a resource-scoped definition is its all-records form.
An explicit `false` on a row suppresses only the class default of that binding (an unbound `false`
suppresses `User`; a `false` on the row of an organization suppresses `Member`/`Owner` there).
Grants are additive — there is no deny rule over a group's grant. A listing marks each grant's
`origin`: `Direct`, `Default`, or `Group` with `through` naming the group. A backend that cannot
evaluate classes (Keycloak) refuses any `defaultClass` other than `None` with `IamUnsupported`.

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
  // definition; see "Permission model (kinds and grant forms)"
  grantPermission: (entityId: string, clientId: string, profileId: string, permission: string, args?: IamGrantArgs) => Promise<IamGrant>
  revokePermission: (entityId: string, clientId: string, profileId: string, permission: string, args?: IamGrantArgs) => Promise<void>

  // Grant everything a bundle selects to each subject, idempotently, in ONE read and write per
  // subject. Returns what each subject now holds, not what changed. Use it instead of looping over
  // grantPermission, which costs N·M writes and N·M lost-update windows on the same records.
  grantBundle: (entityId: string, clientId: string, profileIds: string[], bundle: IamGrantBundle) => Promise<IamGrant[]>

  // Direct, default-class and group grants, each with its `origin`.
  listGrants: (entityId: string, clientId: string, profileId?: string) => Promise<IamGrant[]>

  // --- Users of one client — see "Users are per client" ---

  listUsers: (entityId: string, clientId?: string) => Promise<IamUser[]>
  getUser: (entityId: string, clientId: string, profileId: string) => Promise<IamUser | null>
  inviteUser: (entityId: string, clientId: string, invite: IamUserInvite) => Promise<IamUser>
  updateUser: (entityId: string, clientId: string, profileId: string, update: IamUserUpdate) => Promise<IamUser>
  removeUser: (entityId: string, clientId: string, profileId: string) => Promise<void>

  // The owning organization's staff, admitted to the client through the managed `members` group.
  syncStaff: (entityId: string, clientId: string, args: IamStaffSyncArgs) => Promise<IamStaffSyncReport>

  // --- Tenancy facets — see "Organizations, groups and subjects" ---
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

## Organizations, groups and subjects

The three facets of `IamService` carry tenancy. A backend that cannot provide one answers
`unsupportedFacet<IamOrganizationFacet>('organizations')` (and so on): every method of it throws
`IamUnsupported(what)` SYNCHRONOUSLY, because `subjects.identify` is synchronous and a rejected
promise would hand it the wrong type — an awaited call rejects either way.

- **Tenancy is the client's configuration.** `IamClientConfig.users` / `.operators` turn it on: with
  neither flag, every subject acts in the client's owning organization (a single-tenant app); with
  either, each subject acts in organizations of its own and the provider claims them under the
  `organizations` scope (`@owlmeans/oidc`). The flags also gate the runtime API's writes by area.
- **`organizations`** — `list`, `get`, `create({ title?, profileId? })` (that subject becomes the
  owner), `update({ title })`, `members`, `addMember` (find-or-create by e-mail, idempotent, refused
  past the membership cap), `updateMember`, `removeMember`. The last owner cannot be demoted or
  removed (`IamOrganizationError`).
- **`groups`** — a group is (organization, client, key), kept inside the organization record; one
  client never reads or writes another's. `list`, `ensure`, `remove`, `members`, `addMembers`,
  `removeMembers`, `grant` / `revoke` (bound to the group's organization), `grants`, and
  `setBundles` — a bundle (`{ filter?, permissions? }`) grants every definition it selects to the
  group's members at claim time. `IAM_MEMBERS_GROUP` is the managed group `syncStaff` keeps in the
  owning organization; it is read-only to an operator (`IamGroupError`).
- **`subjects`** — the provider's half, keyed by the ACCOUNT, which never leaves the provider.
  `signIn(clientId, { email })` finds or creates the account and its rows for the client;
  `resolve(clientId, accountId)` builds the `IamSubject` the claims come from (`null` = not admitted:
  no row, or a disabled primary row); `identify(clientId, accountId)` is the pairwise `sub`.

## Runtime IAM API

`makeIamRuntimeProtocols({ service, path? })` declares the provider-side API a tenanted client's
server calls on behalf of its signed-in subject. It is declarations only: the provider binds it, and
a relying party calls it through `iamRuntime` (`@owlmeans/server-iam`) over plain `fetch`.

| Route (under `path`, default `IAM_RUNTIME_PATH`) | Tree | Who |
|---|---|---|
| `GET /organizations` | `organizations.list` | any subject — its own |
| `POST /organizations` `{ title? }` | `organizations.create` | any subject of a tenanted client; it becomes owner |
| `POST /organizations/:entitySlug` `{ title }` | `organizations.update` | owner |
| `GET /organizations/:entitySlug/members` | `members.list` | member |
| `POST /organizations/:entitySlug/members` `{ email, name?, owner? }` | `members.add` | owner; idempotent by e-mail |
| `POST …/members/:profileId` `{ owner?, groups? }` | `members.update` | owner |
| `POST …/members/:profileId/remove` | `members.remove` | owner, or the member itself |
| `GET …/permissions` | `permissions.list` | member |
| `GET …/grants` `?profileId` | `grants.list` | owner |
| `POST …/grants`, `POST …/grants/revoke` `{ profileId, permission, resources?, mode? }` | `grants.assign` / `grants.revoke` | owner |

- **Every route, the base included, is pinned to `service`** — a route's service is never inherited
  from its parent — and every leaf hangs under ONE base carrying `IAM_RUNTIME_GUARD`. The serving
  process registers that guard: it admits only a bearer access token the provider issued, and takes
  the client and the account from it, never from the request.
- **The wire names organizations by `entitySlug` and subjects by the calling client's pairwise
  `profileId`** — no organization or account id appears in any shape. Every schema is closed, since
  the server's AJV strips an undeclared key silently. `IAM_RUNTIME_ROUTES` is the one leaf-path table
  the declarations and the fetch client share.
- The serving process enforces the write rules: only `entityScoped`, unmanaged definitions of the
  CALLING client, binding forced to the path's organization, the last owner protected, the
  membership cap, and only for an area the client's tenancy config opens (`users` → `user`,
  `operators` → `operator`). A non-owner write is `AuthForbidden(ORGANIZATION_OWNER_REFUSAL)`.

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

Every implementation sets `realm` to the entity id, so read `client.realm ?? fallbackEntityId` and
never reach into an adapter's own internals (`(client as any)._realm`) for the same value.

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
