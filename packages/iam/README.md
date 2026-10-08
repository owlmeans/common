# @owlmeans/iam

Provider-agnostic IAM contracts: the `IamService` interface (client provisioning, permission
definitions and grants, users of a client, organization/group/subject facets), the permission-name
and gate-param grammars, `hasPermission`, the IAM errors, and the protocol declarations of the
provider's runtime IAM API. An app imports it to type the IAM service it resolves by alias, to
declare and grant permissions, to check an `Authorization` against a permission, and to build gate
params. It contains no implementation and talks to no provider — a concrete backend (a Keycloak
proxy, or the integrated backend built on `@owlmeans/server-oidc-provider`) ships separately, the
server-side gate and runtime client are `@owlmeans/server-iam`, and the browser half (organization
switch, `hasPermission` re-export) is `@owlmeans/client-iam`. Permission decisions belong on the
server; the `iam` skill holds the full model.

## Installation

```bash
bun add @owlmeans/iam@^0.1.18-rc.51
```

`ajv` is a peer dependency (the runtime API schemas are `JSONSchemaType`).

## Concepts

- **Owning organization entity vs. acting organization** — every `IamService` method takes
  `entityId` first: the organization entity that **owns** the client, resolved server-side. The
  organizations a client's subjects act in are named by `entitySlug` inside the facets and on the
  wire.
- **Client** — an OIDC client (`IamClient`) of one organization entity. Its id is globally unique,
  because a provider resolves the bare `client_id` with no tenant context.
- **Permission name** — `<resource>--<action>` with **two** hyphens (`PERMISSION_ACTION_SEPARATOR`);
  a bare `<resource>` is unscoped. A name never carries `@`.
- **Permission kinds** — a definition is unbound, `entityScoped` (grants bound to one organization),
  `resourceScoped` (grants may list resource ids), or both. The kind is a property of the definition.
- **Grant form** — `IamGrantMode.Blanket` (no `resources`, covers every id), `Resources` (an explicit
  id list), `All` (revoke-only). The two grantable forms are stored separately.
- **Default class** — `IamDefaultClass.User` / `Member` / `Owner` / `None`: who holds a definition
  without an explicit grant, evaluated when claims are built.
- **Facets** — `organizations`, `groups`, `subjects` on `IamService`; a backend without one answers
  `unsupportedFacet(what)`.
- **Gate param** — `<permission>[@<selector>]` on an entrypoint guard; the selector says where the
  resource id is read at request time: bare `@enquiryId` (flat key, params then query) or qualified
  `@body:order.id` (one source, nested path).

## Usage

### Check a permission

```typescript
import { hasPermission } from '@owlmeans/iam'

// A blanket set satisfies a resourceId check; a bound set counts only for the named organization
const allowed = hasPermission(auth, 'order--edit', { scope: clientId, resourceId: 'ord-1', entitySlug: 'acme' })
```

### Declare and grant permissions

```typescript
import { DEFAULT_ALIAS, IamDefaultClass, IamGrantMode, permissionNameHelper } from '@owlmeans/iam'
import type { IamService } from '@owlmeans/iam'

const iam = context.service<IamService>(DEFAULT_ALIAS)

const name = await iam.ensurePermission(entityId, clientId, 'order', {
  permission: 'edit', resourceScoped: true, entityScoped: true, area: 'user',
  defaultClass: IamDefaultClass.Owner,
})                                                          // 'order--edit'

await iam.grantPermission(entityId, clientId, profileId, name, {
  mode: IamGrantMode.Resources, resources: ['ord-1'], entitySlug: 'acme',
})
await iam.revokePermission(entityId, clientId, profileId, name, { mode: IamGrantMode.All, entitySlug: 'acme' })

permissionNameHelper.parsePermissionName('order--edit')    // { name, resource: 'order', action: 'edit' }
permissionNameHelper.composePermissionName({ resource: 'order', action: 'edit' })
```

### Provision a client

```typescript
const client = await iam.ensureClient(entityId, clientId, {
  redirectUris: ['https://acme.example.com/callback'],
  config: { users: true },                                  // tenanted: subjects get organizations of their own
})
const issuer = await iam.getIssuerUrl(entityId)             // pass through as the discovery URL, never rebuild it
```

### Work with gate params

```typescript
import { GateParamSource, gateParamHelper, gateValidationHelper, resolveGateResource } from '@owlmeans/iam'

const param = gateParamHelper.formatGateParam('order--edit', { source: GateParamSource.Body, path: ['order', 'id'] })
// 'order--edit@body:order.id'

const { permission, resource, error } = gateParamHelper.parseGateParam(param)
const resolved = resource != null ? resolveGateResource(req, resource) : undefined   // { id?, from?, reason? }

const issues = gateValidationHelper.validateGateParams(['order--view@orderId'], { routePath: '/orders/:orderId' })
```

### A backend without a facet

```typescript
import { unsupportedFacet } from '@owlmeans/iam'
import type { IamGroupFacet } from '@owlmeans/iam'

const groups = unsupportedFacet<IamGroupFacet>('groups')    // every method throws IamUnsupported('groups') synchronously
```

## API

### `IamService` (alias `DEFAULT_ALIAS` = `'iam-service'`)

| Group | Methods |
|---|---|
| Admin config | `getEntityAdminConfig`, `getCredentialsPair`, `getIssuerUrl` |
| Clients | `ensureClient(entityId, clientId, { redirectUris?, config? }?)`, `getClient`, `claimClient`, `deleteClient` |
| Definitions | `ensurePermission`, `deletePermission(…, names, { policy?, managed? }?)`, `normalizePermissions`, `ensureResourceOwnership`, `listPermissions(…, filter?)` |
| Grants | `grantPermission`, `revokePermission`, `grantBundle`, `listGrants` |
| Users of a client | `listUsers`, `getUser`, `inviteUser`, `updateUser`, `removeUser`, `syncStaff` |
| Facets | `organizations` (`IamOrganizationFacet`), `groups` (`IamGroupFacet`), `subjects` (`IamSubjectFacet`) |

### Functions and helpers

| Symbol | Purpose |
|---|---|
| `hasPermission(auth, permission, { scope?, resourceId?, entitySlug? }?)` | Does an `Authorization`'s permission sets grant it |
| `permissionNameHelper` (`createPermissionNameHelper()`) | `parsePermissionName`, `composePermissionName`, `isPermissionName` |
| `gateParamHelper` (`createGateParamHelper()`) | `parseGateParam`, `parseGateSelector`, `formatGateParam` |
| `gateValidationHelper` (`createGateValidationHelper()`) | `validateGateParams(params, audit?)`, `routeParamsOf(path)` |
| `resolveGateResource(req, selector)` | Read the resource id a selector points at → `{ id?, from?, reason? }` |
| `unsupportedFacet<T>(what)` | A facet whose every method throws `IamUnsupported(what)` |
| `makeIamRuntimeProtocols({ service, path? })` | Protocol tree of the runtime IAM API: `organizations.{list,create,update}`, `members.{list,add,update,remove}`, `permissions.list`, `grants.{list,assign,revoke}` |
| `parsePermissionName`, `isPermissionName`, `parseGateParam` | Deprecated standalone forms of the helper members |

### Constants and enums

| Symbol | Value / members |
|---|---|
| `IAM_MODE_KEYCLOAK`, `IAM_MODE_INTEGRATED`, `IamMode` | `'keycloak'`, `'integrated'` — a config seam for the app's own service factory |
| `IAM_AREAS`, `IamArea` | `['user', 'operator', 'admin']` — presentational grouping tags |
| `PERMISSION_ACTION_SEPARATOR` | `'--'` |
| `RESOURCE_PARAM_SEPARATOR`, `RESOURCE_SOURCE_SEPARATOR`, `RESOURCE_PATH_SEPARATOR` | `'@'`, `':'`, `'.'` |
| `GateParamSource`, `DEFAULT_GATE_PARAM_SOURCES` | `Params` `Query` `Body` `Headers` `Auth`; bare form searches `[Params, Query]` |
| `GateParamErrorCode`, `GateResolutionFailure` | structural selector problems; why a selector yielded no id |
| `IamGrantMode`, `IamRemovalPolicy`, `IamDefaultClass`, `IamGrantOrigin` | `Blanket`/`Resources`/`All`; `Cascade`/`Refuse`; `None`/`User`/`Member`/`Owner`; `Direct`/`Default`/`Group` |
| `IAM_MEMBERS_GROUP`, `IAM_EMAIL_PROOF` | `'members'` (managed staff group), `'proof:email'` |
| `IAM_RUNTIME_GUARD`, `IAM_RUNTIME_PATH`, `IAM_RUNTIME_ROUTES` | runtime API guard alias, default base `'/runtime'`, leaf-path table |
| `IamRuntime*Schema` | closed AJV schemas of the runtime API's wire shapes |

### Types

`IamClient`, `IamClientInfo`, `IamClientConfig`, `IamClientOptions`, `IamCredentialsPair`,
`IamPermissionArgs`, `IamPermissionDefinition`, `IamPermissionFilter`, `IamResourceSpec`,
`IamGrant`, `IamGrantArgs`, `IamGrantBundle`, `IamGroupRef`, `IamPermissionDeleteArgs`,
`IamPermissionRemoval`, `IamNormalizeArgs`, `IamNormalizationReport`, `IamUser`, `IamUserInvite`,
`IamUserUpdate`, `IamMembershipInfo`, `IamOrganization*`, `IamMember*`, `IamGroup*`,
`IamStaffSync*`, `IamSubject`, `IamSignIn*`, the three facet interfaces, `HasPermissionOptions`,
`ParsedPermissionName`, `PermissionNameHelper`, the `Gate*` types and the `IamRuntime*` wire types.

### Errors

All extend `IamError` (a `ResilientError`) and are registered for marshalling.

| Class | Meaning |
|---|---|
| `IamClientError` | client invalid or unusable — `client:entity-mismatch`, `redirect-uris`, unconfigured provider route |
| `IamResourceError` | a provider resource came back without a name |
| `IamGrantError` | grant subject missing or entity mismatch |
| `IamPermissionError` | definition refusal — `permission:held:<name>`, `permission:managed:<name>`, a disallowed `defaultClass` |
| `IamUserError` | an end-user operation was refused |
| `IamOrganizationError` | unknown organization, last owner, membership cap |
| `IamGroupError` | unknown group key, managed group written by an operator, another client's group |
| `IamUnsupported` | the active backend cannot do it (`user-management`, `resource-scoped-grant`, a facet) |

## Common pitfalls

- `revokePermission` without `mode` defaults to `All`, `grantPermission` to `Blanket`; pass `mode`
  explicitly.
- Granting an `entityScoped` definition requires `args.entitySlug`; any other definition refuses it.
- One hyphen is not a separator: `enquiry-view` is a resource with no action. Build names with
  `permissionNameHelper`, never by splitting strings.
- `@` belongs to the gate param, never to a stored name — `ensurePermission` refuses it.
- Always pass `redirectUris` to `ensureClient`; the integrated provider refuses the legacy wildcard.
- Never rebuild an issuer URL from a host and base path — use `getIssuerUrl`.
- A client id must include the owning organization entity and be reserved with `claimClient`;
  `ensureClient` refuses another entity's record.
- Use `grantBundle` instead of looping over `grantPermission`.
- `getCredentialsPair` returns a raw admin token — never hand it to a request handler.
- `entityId` never comes from a token or request; the wire names organizations by `entitySlug` only.

## Related packages

- [`@owlmeans/server-iam`](../server-iam) — the IAM gate, the session's organizations on the server, the runtime IAM client
- [`@owlmeans/client-iam`](../client-iam) — browser wiring, organization switch, `hasPermission` re-export
- [`@owlmeans/oidc`](../oidc) — provider descriptors, claim shapes, the `iamMode` config field
- [`@owlmeans/auth`](../auth) — `Authorization` and `PermissionSet`, which `hasPermission` reads
- [`@owlmeans/server-oidc-provider`](../server-oidc-provider) — the provider the integrated backend is built on
- [`@owlmeans/entrypoint`](../entrypoint) — the protocol builders behind `makeIamRuntimeProtocols`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.51
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
