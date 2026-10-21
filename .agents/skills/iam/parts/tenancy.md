---
name: tenancy
description: The organizations, groups and subjects facets of IamService, and the runtime IAM API a tenanted client's server calls.
metadata:
  purposes: auth, server-api
  mentions: IamOrganizationFacet, IamGroupFacet, IamSubjectFacet, unsupportedFacet, IAM_MEMBERS_GROUP, makeIamRuntimeProtocols, IAM_RUNTIME_GUARD, IAM_RUNTIME_ROUTES, IAM_RUNTIME_PATH, iamRuntime
---

# @owlmeans/iam — Organizations, groups, subjects and the runtime API

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
  `removeMembers`, `grant` / `revoke` (bound to the group's organization; a revoke restricts, as for
  a person), `grants(…, key, args?)` (its own grants as `Direct`, the names its bundles select as
  `Bundle`, minus what it restricts; `args.restricted` adds the cut bundle names), and `setBundles` —
  a bundle (`{ filter?, permissions? }`) grants every definition it selects to the group's members at
  claim time. `IAM_MEMBERS_GROUP` is the managed group `syncStaff` keeps in the owning organization:
  its existence, key, membership and bundles are the sync's (`ensure`, `remove`, `addMembers`,
  `removeMembers`, `setBundles` → `IamGroupError('managed:members')`), while its grants and
  restrictions are the operator's (`grant` / `revoke`) and survive every sync.
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
| `POST …/grants`, `POST …/grants/revoke` `{ profileId, permission, resources?, mode? }` | `grants.assign` / `grants.revoke` (a revoke restricts; `mode: inherit` takes the own value back) | owner |

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
