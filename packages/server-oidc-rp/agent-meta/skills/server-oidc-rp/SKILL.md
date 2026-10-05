---
name: server-oidc-rp
description: How to use @owlmeans/server-oidc-rp — the server-side OIDC relying party — appendOidcGuard, oidcEntrypoints and makeAuthServiceEntrypoints, the OidcClientService and its adapter, the requested-scope contract, the UMA2 gate, the wrapped-token service, the acting organization of a tenanted session and its switch, and the owned public types that keep openid-client out of the public surface. Auto-invoked when importing server-oidc-rp helpers or configuring identity providers on a server.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-oidc-rp

**Layer:** Server
**Install:** `"@owlmeans/server-oidc-rp": "^0.1.18-rc.54"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeOidcClientService(alias?)` | The relying-party service: reads `cfg.oidc.providers`, runs discovery, hands back client adapters |
| `makeOidcWrappingService()` | Registers `WRAPPED_OIDC` — refreshes and re-issues an OIDC-wrapped token before it goes stale, and answers the acting organization as `entity` |
| `makeOidcGate(alias?)` | The UMA2 gate, registered under `OIDC_GATE` |
| `appendOidcGuard<C, T>(context, opts?)` | Registers the OIDC guard on a server context. `opts` is `OidcGuardOptions` (`@owlmeans/oidc`) and is forwarded to the base guard unchanged |
| `oidcEntrypoints` | Server-local bindings for the shared `oidcProtocols`: `init`, `authenticate`, and the switch `organizations` / `organization` |
| `makeAuthServiceEntrypoints(serviceAlias, prefix?)` | Returns provider-list and token-update protocol declarations, guarded by `GUARD_ED25519`. `prefix` defaults to `oidc-api` |
| `requestedScope(extraScopes?)` | The `scope` of an authorization request — base scopes plus the provider's extras, deduplicated |
| `createGateModel(ctx)` | The UMA2 permission model — `loadPermissions(auth, params)` |
| `extractPermissionSets(claim)` | Shape-validates a `permissions` claim into `OidcPermissionSetClaim[]` (bindings kept), or `undefined` |
| `extractOrganizations(claim)` | Shape-validates an `organizations` claim; `undefined` = no claim (a client without the scope) |
| `pickOrganization(orgs, { entityKey?, entitySlug? })` | The acting organization — see "Organizations" |
| `actingPermissionSets(sets, entitySlug?)` | The sets a browser token may carry: unbound ones plus the acting organization's, binding stripped |
| `actingAuth(user, org, sets?)` | `user` re-shaped for `org`: its slug, groups and flattened sets, nothing of the previous organization |
| `resolvedEntityOf(org)` | `{ id: entityKey, slug: entitySlug, iamKey: entityKey }` |
| `organizationItemOf(org, acting?)` | The switch's key-less view of one organization |
| `sessionRecord(context, token)` | The `:token:` record behind a wrapped token's `token`; `AuthorizationError('record')` when gone |
| `OIDCAuthCache` | The cache record type (verifier, exchange and session records share it) |
| `authService` | The service entrypoint aliases: `authService.provider.list`, `authService.auth.update` |
| `DEFAULT_ALIAS` | `'oidc-client'` — the relying-party service alias |
| `DEF_OIDC_ACCOUNT_LINKING`, `DEF_OIDC_PROVIDER_API` | Default aliases of the two optional seams below |
| `OIDC_TOKEN_STORE` | The **record-id prefix** this package composes cache ids from — not a resource alias. See "Where the tokens are cached" |
| `OIDC_AUTH_LIFTETIME` | Seven days — the absolute TTL of an issued wrapper and its stored token record |
| `OIDC_WRAP_FRESHNESS` | How long a validated record stays fresh: inside this window of its last validation the wrapping service returns the token unchanged, past it the token is re-validated and re-issued |
| `PROVIDER_CACHE_TTL` | Exported, but its only use in the package is commented out — it configures nothing |
| `AccountLinkingService` | Optional seam: turn a provider profile into a local `AuthPayload` (`getLinkedProfile`, `linkProfile(details, { username })`, `linkCredentials`, `getOwnerProfiles`, `getOwnerCredentials`) |
| `ProviderApiService` | Optional seam onto the provider's own admin API (`getUserDetails`, `getSettings`) |
| `OidcRpConfig` | `cfg.oidc` plus `accountLinkingService?` and `providerApiService?` |

### Subpath exports

- `./auth` — `OIDC_ADMIN_CLIENT` (`'admin-cli'`)
- `./auth/plugins` — importing it registers the `OIDC_CLIENT_AUTH` and `GOOGLE_CLIENT_AUTH` plugins
  into the `@owlmeans/server-auth` manager registry

## Wiring

```typescript
import { appendOidcGuard, makeOidcWrappingService, makeOidcGate, makeOidcClientService } from '@owlmeans/server-oidc-rp'

context.registerService(makeOidcClientService())
context.registerService(makeOidcWrappingService())
context.registerService(makeOidcGate())
appendOidcGuard<C, T>(context)
```

```typescript
import { withOidcGuard } from '@owlmeans/oidc'
import { oidcEntrypoints, makeAuthServiceEntrypoints } from '@owlmeans/server-oidc-rp'
import { bindAll } from '@owlmeans/server-entrypoint'

export const configuredProtocols = withOidcGuard(protocols)
export const serverBindings = [
  ...bindAll(configuredProtocols.api),
  ...oidcEntrypoints,
  ...bindAll(makeAuthServiceEntrypoints('my-auth-api')),
]
```

Decorate the application tree before binding it; do not mutate declarations or append protocol
objects to a server entrypoint list. `oidcEntrypoints` are bindings and are spread once. The
auth-service helper returns declarations, so bind those declarations in the serving app.

```typescript
// config
cfg.oidc ??= {}
cfg.oidc.providers ??= []
cfg.oidc.providers.push({
  clientId: OIDC_ADMIN_CLIENT,
  basePath: 'realms/master',
  // the alias of a registered service whose host the issuer is reassembled from;
  // a provider reachable by its own URL carries `discoveryUrl` instead
  service: 'my-iam',
  secret: '/etc/master-secret/oidc-admin-secret',
  internal: true
})
```

A consumer that only needs the IAM defaults calls `appendIam()` from `@owlmeans/server-iam`, which
performs the four registrations above with the IAM gate in place of `makeOidcGate()`.

## Resolving a provider

`OidcClientService` is the only way to reach a provider descriptor. Use `findProvider(predicate)`,
`hasProvider(params)`, `getConfig(clientId | partial)`, `getDefault()` and
`entityToClientId(params)` rather than scanning `cfg.oidc.providers` in downstream code.
`registerTemporaryProvider` / `unregisterTemporaryProvider` add a descriptor learned at runtime and
are reference-counted, so every registration needs its matching removal.

`getConfiguration` prefers `discoveryUrl` verbatim; it falls back to `service` + `basePath` and fails
with `AuthManagerError('oidc.client.basepath')` or `('oidc.client.service')` when neither is usable.
`getClient` returns an `OidcClientAdapter`: `getMetadata`, `getClientId`, `getConfig`, `makeAuthUrl`,
`grantWithCredentials`, `grantWithCode`, `refresh` and `introspect`. That adapter is the whole
supported surface — no `openid-client` object is ever handed out.

## Requested scope

`requestedScope(extraScopes)` is `OIDC_RP_BASE_SCOPES` (`@owlmeans/oidc`) plus the provider
descriptor's `extraScopes`, deduplicated and trimmed. The two generic request sites — the
browser-starts-server-finishes init handler and the `oidc-client` auth plugin — both build their
`scope` from it, and neither may grow a scope literal.

The `GOOGLE_CLIENT_AUTH` plugin refuses a userinfo whose `email_verified` is not the boolean
`true` (`AuthenFailed('email-verified')`): the address is what links the sign-in to an account, so
an unverified one would hand that account to whoever typed it.

It is also the scope exception, and it behaves differently on purpose: it sends
the descriptor's `extraScopes` as the **whole** scope, falling back to `'openid profile email'` when
the descriptor names none. So on a Google descriptor `extraScopes` replaces the base scopes instead
of extending them, and adding a scope to `OIDC_RP_BASE_SCOPES` does not reach it.

The provider's client registration must allow every scope this yields. A provider supports `email`
as soon as it declares `claims.email` — and then rejects the whole request with
`invalid_scope: requested scope is not allowed` if the client's own allowlist omits it, rather than
dropping the scope — so a scope added to the base list needs every provisioned allowlist widened in
the same change.

## Only the `id_token` is a JWT

`id_token` is a JWT by specification; an **access token's format is provider-private**. `oidc-provider`
issues opaque access tokens by default, so `decodeJwt(tokenSet.access_token)` (`jose`) throws
`JWTInvalid: Invalid JWT`. Inside the exchange handler that failure surfaces as a 500 on the
`DISPATCHER_OIDC` endpoint *after* the code exchange already succeeded, which reads as a broken login
rather than as the log line it came from. Decode only `tokenSet.id_token` — every claim this package
needs (`sub`, the `PERMISSIONS_CLAIM` grant) lives there. This applies to debug logging too: a
`console.log` argument is evaluated before the call, so a throwing decode in a log statement fails the
request just as hard as one in real logic. Never introspect an access token locally; use the
provider's introspection endpoint (`introspect`) when its contents are genuinely needed.

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

- **Sign-in** (`authenticate`): `pickOrganization(orgs, { entitySlug: requested })` — the slug the
  browser sent to `init` when the subject is a member, else the claim's `home`, else the first. An
  empty claim refuses the sign-in (`AuthenFailed('entity')`). The token carries that organization's
  `entitySlug`, `groups` and `actingPermissionSets(sets, slug)`; the record keeps `acting`,
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
  `OIDC_GUARD`) reads the record the guard just refreshed. `GET` lists `organizationItemOf` items
  (never `entityKey`); `POST { entitySlug }` re-signs the token for that organization, sets `acting`
  and answers `{ token }`. An organization the record does not list — or any, for a session without
  the claim — is `AuthForbidden(ORGANIZATION_REFUSAL)`.

The browser token never carries `entityKey` or a bound set of another organization: everything
else of the claim stays in the session record.

## PKCE verifiers are consume-once

The verifier cached at init is read back with the resource's `take` — a delete-and-return. The
exchange therefore succeeds exactly once per authorization code: a repeated exchange (a React effect
that runs twice for one `code`, a retried request) fails with `resource:unknown-record` even though
the first attempt worked. Callers guard against re-entry rather than expecting the read to be
idempotent.

## `entityId` in the browser-starts-server-finishes flow

The init handler resolves the OIDC client two ways: via `getDefault()` (a provider flagged `def: true`,
matched without looking at `entityId` at all) or, only when no default exists, via a remote provider
lookup keyed by the caller-supplied `entityId`. The cached verifier record carries `entityId` **only**
when that second path actually used it to resolve the client. The exchange step later calls
`getConfig({ clientId, ...(entityId != null ? { entityId } : {}) })`, which requires an exact match on
every field it is given; a stored `entityId` that was never validated against the registered provider
— a caller-side default or placeholder, say — makes the exchange fail with a bare `AuthenFailed()`
even though the same default provider is trivially available again at exchange time.

## A server context has no `url()`

`DISPATCHER` (the redirect URI) is a FRONTEND route resolved from a SERVER context, and `.url()` is
attached only by `@owlmeans/client-entrypoint` — `ClientEntrypoint.url` type-checks on the server and
throws `….url is not a function` at request time. To build an absolute URL for a route this server
does not own, type the reference as `CommonEntrypoint` (so `.url()` is a compile error) and compose
`makeSecurityHelper(ctx).makeUrl(entry.address(), entry.path())` (`@owlmeans/config`), substituting
path params first — the same pattern as the provider's interaction URL (`server-oidc-provider`).

## Public type contract (isolation principle)

`openid-client` types **never appear in this package's public exports**. All public types are
OwlMeans-owned:

| Owned type | Replaces upstream | Description |
|---|---|---|
| `OidcTokenSet` | `TokenEndpointResponse & TokenEndpointResponseHelpers` | `access_token`, `refresh_token`, `id_token`, `token_type`, `expires_in`, `scope`, `claims()` |
| `OidcTokenSetParameters` | `TokenEndpointResponse` | The same without the helper method |
| `OidcGrantChecks` | `AuthorizationCodeGrantChecks` | `{ pkceCodeVerifier?: string; idTokenExpected?: boolean }` |
| `OidcServerMetadata` | `ServerMetadata` | Issuer and endpoint metadata |
| `OidcIntrospectionResponse` | `IntrospectionResponse` | `active`, `scope`, `sub`, `client_id`, … |
| `OidcClientDescriptor` | `Configuration` (opaque) | Pass-through; consumers must never read its internals |

What the owned names guarantee is the **exported** surface, not the internal imports. The type module
imports `Configuration`, `ServerMetadata`, `TokenEndpointResponse` and `TokenEndpointResponseHelpers`
from `openid-client` in order to alias them under those names; the service module imports the
functional `openid-client` API; and `jose`'s `decodeJwt` is read directly by the token wrapper, the
`oidc-client` auth plugin and the exchange handler. A library swap touches every one of those
modules — what the owned names buy is that it stops there and never reaches a consumer. See
[[oidc-versions]].

## Rules

- An application that uses an identity provider **only to log in**, and then maps the subject onto a
  local identity through `@owlmeans/server-auth-identity`, must not adopt `appendOidcGuard()` or
  `makeOidcGate()` (`OIDC_GATE`) as its authorization mechanism. Those decide against the
  provider's grants; a product that owns its own identity records declares its own gate alias and
  `GateService` over them.
- The browser starts the flow and the server finishes it: the exchange, the account linking and the
  bearer token an application actually carries are all produced here.
- Register the wrapping service whenever the guard is registered — an OIDC-wrapped token that nothing
  refreshes expires mid-session.
- A provider configured with `sessionValidation: 'required'` is authoritative on every protected
  request: the wrapper must require same-client introspection and current userinfo claims. An
  invalid provider token clears the local wrapper (401); an authority or registry outage fails
  closed as `AuthUnavailable` (503) without deleting a valid local session.
- When `AUTH_SESSION_MANAGER` is registered, exchange creates a tracked OIDC session and the
  wrapper rejects pre-registry tokens. It acknowledges a changed authorization revision only after
  live provider validation, and never extends the original wrapper/cache expiry while doing so.
- Provider descriptors, token sets, PKCE verifiers, authorization codes and cached challenge
  records are secrets. Do not log them or pass them to diagnostics.

## Depends On

- `@owlmeans/oidc`, `@owlmeans/server-auth`, `@owlmeans/server-context`, `@owlmeans/server-entrypoint`,
  `@owlmeans/server-api`, `@owlmeans/auth`, `@owlmeans/auth-common`, `@owlmeans/basic-envelope`,
  `@owlmeans/client-entrypoint`, `@owlmeans/config`, `@owlmeans/context`, `@owlmeans/did`,
  `@owlmeans/entrypoint`, `@owlmeans/resource`, `@owlmeans/route`, `@noble/hashes`, `@scure/base`,
  `dayjs`
- `ajv` (peer)
- `openid-client@6.8.4` (exact), `jose@6.2.5` (exact) — see [[oidc-versions]]
