---
name: sessions
description: Where the verifier, exchange and session records are cached, and the acting organization of a tenanted session and its switch.
metadata:
  purposes: auth, state
  mentions: OIDC_TOKEN_STORE, AUTH_CACHE, oidcCacheOf, sessionRecord, oidcOrganizationHelper, ORGANIZATIONS_SCOPE, pickOrganization, switchOrganization, listOrganizations, ORGANIZATION_REFUSAL
---

# @owlmeans/server-oidc-rp — Token cache and organizations

## Where the tokens are cached

There is no dedicated resource. The cache is `AUTH_CACHE` from `@owlmeans/server-auth`, and
`OIDC_TOKEN_STORE` is only the prefix of the ids written into it:

| Record id | Holds |
|---|---|
| `${OIDC_TOKEN_STORE}:verifier:<challenge or state>` | The PKCE verifier, the client it belongs to and the requested `entitySlug`, until the exchange takes it |
| `${OIDC_TOKEN_STORE}:exchange:<exchange token>` | The token set from a completed code exchange, short-lived, deleted when the process step consumes it |
| `${OIDC_TOKEN_STORE}:token:<bearer token>` | The session: the live token set for an issued wrapper, saved with its original absolute `OIDC_AUTH_LIFTETIME` expiry; for a tenanted client also `acting` (entityKey), `entity`, the last `organizations` claim and the last raw `sets` |

A consumer that needs the provider token set behind the request it is serving reads
`context.resource(AUTH_CACHE)` at `${OIDC_TOKEN_STORE}:token:<token>` — never
`context.resource(OIDC_TOKEN_STORE)`, which resolves nothing.

A missing `:token:` record is a session that is gone — signed out, expired, evicted — and every
reader answers it as `AuthorizationError` (401, sign in again): the wrapping service, and the gate
model's `loadPermissions`, which `load`s the record rather than `get`ting it, since a bare `get`
would let the storage refusal escape as a 404. A record without a token set is `AuthForbidden`.

## Organizations

A client granted `ORGANIZATIONS_SCOPE` (`@owlmeans/oidc`) receives the subject's `organizations`
claim and the full `permissions` claim, bound sets carrying `entitySlug`. The session acts in ONE
organization at a time:

- **Sign-in** (`authenticate`): `oidcOrganizationHelper.pickOrganization(orgs, { entitySlug: requested })` — the slug the
  browser sent to `init` when the subject is a member, else the claim's `home`, else the first. An
  empty claim refuses the sign-in (`AuthenFailed('entity')`). The token carries that organization's
  `entitySlug`, `groups` and `oidcOrganizationHelper.actingPermissionSets(sets, slug)`; the record keeps `acting`,
  `entity`, `organizations` and the raw `sets`. The handler answers `{ token }` alone.
- **No `organizations` claim** (a client without the scope): a single-organization session —
  `entitySlug = cfg.entityId`, the claim's unbound sets, no `acting`, no entity attached.
- **Every validation** (userinfo under `sessionValidation: 'required'`, and the refresh path)
  re-picks by `entityKey` alone. A renamed organization renames the session; a subject removed from
  the acting organization loses the session (`AuthorizationError('entity')`, record deleted) — it is
  never moved into another organization silently, which would change what every later request is
  authorized for.
- **The wrapper answers `{ token, entity }`** whenever the record acts in an organization — on the
  freshness shortcut too — and the guard attaches it, because the relying party of a tenanted client
  has no registry to resolve the slug from.
- **The switch** (`listOrganizations`, `switchOrganization`, bound by `oidcEntrypoints` behind
  `OIDC_GUARD`) reads the record the guard just refreshed. `GET` lists `oidcOrganizationHelper.organizationItemOf` items
  (never `entityKey`); `POST { entitySlug }` re-signs the token for that organization, sets `acting`
  and answers `{ token }`. An organization the record does not list — or any, for a session without
  the claim — is `AuthForbidden(ORGANIZATION_REFUSAL)`.

The browser token never carries `entityKey` or a bound set of another organization: everything
else of the claim stays in the session record.
