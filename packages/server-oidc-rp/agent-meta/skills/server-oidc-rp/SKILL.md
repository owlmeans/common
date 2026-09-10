---
name: server-oidc-rp
description: How to use @owlmeans/server-oidc-rp — the server-side OIDC relying party — appendOidcGuard and setupOidcGuard, the OidcClientService and its adapter, the requested-scope contract, the UMA2 gate, the wrapped-token service, and the owned public types that keep openid-client out of the public surface. Auto-invoked when importing server-oidc-rp helpers or configuring identity providers on a server.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-oidc-rp

**Layer:** Server
**Install:** `"@owlmeans/server-oidc-rp": "^0.1.18-rc.18"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeOidcClientService(alias?)` | The relying-party service: reads `cfg.oidc.providers`, runs discovery, hands back client adapters |
| `makeOidcWrappingService()` | Registers `WRAPPED_OIDC` — refreshes and re-issues an OIDC-wrapped token before it goes stale |
| `makeOidcGate(alias?)` | The UMA2 gate, registered under `OIDC_GATE` |
| `appendOidcGuard<C, T>(context, opts?)` | Registers the OIDC guard on a server context. `opts` is `OidcGuardOptions` (`@owlmeans/oidc`) and is forwarded to the base guard unchanged |
| `setupOidcGuard(entrypoints, coguards?)` | Appends the dispatcher entrypoints and elevates them with the `init` and `authenticate` handlers |
| `setupAuthServiceEntrypoints(entrypoints, serviceAlias, prefix?)` | Declares and elevates the provider-list and token-update service entrypoints, guarded by `GUARD_ED25519`. `prefix` defaults to `oidc-api` |
| `requestedScope(extraScopes?)` | The `scope` of an authorization request — base scopes plus the provider's extras, deduplicated |
| `createGateModel(ctx)` | The UMA2 permission model — `loadPermissions(auth, params)` |
| `extractPermissionSets(claim)` | Shape-validates a `permissions` claim into `PermissionSet[]`, or `undefined` |
| `authService` | The service entrypoint aliases: `authService.provider.list`, `authService.auth.update` |
| `DEFAULT_ALIAS` | `'oidc-client'` — the relying-party service alias |
| `DEF_OIDC_ACCOUNT_LINKING`, `DEF_OIDC_PROVIDER_API` | Default aliases of the two optional seams below |
| `OIDC_TOKEN_STORE` | The **record-id prefix** this package composes cache ids from — not a resource alias. See "Where the tokens are cached" |
| `OIDC_AUTH_LIFTETIME` | 24 h — the TTL a stored token record is saved with |
| `OIDC_WRAP_FRESHNESS` | How long a validated record stays fresh: inside this window of its last validation the wrapping service returns the token unchanged, past it the token is re-validated and re-issued |
| `PROVIDER_CACHE_TTL` | Exported, but its only use in the package is commented out — it configures nothing |
| `AccountLinkingService` | Optional seam: turn a provider profile into a local `AuthPayload` (`getLinkedProfile`, `linkProfile`, `linkCredentials`, `getOwnerProfiles`, `getOwnerCredentials`) |
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
import { setupOidcGuard, setupAuthServiceEntrypoints } from '@owlmeans/server-oidc-rp'

setupOidcGuard(appEntrypoints)
// second argument: the alias of the registered service that hosts these two auth-service
// routes — they are elevated caller-side, so it addresses them rather than mounting them
setupAuthServiceEntrypoints(managerEntrypoints, 'my-auth-api')
```

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

The `GOOGLE_CLIENT_AUTH` plugin is the exception, and it behaves differently on purpose: it sends
the descriptor's `extraScopes` as the **whole** scope, falling back to `'openid profile email'` when
the descriptor names none. So on a Google descriptor `extraScopes` replaces the base scopes instead
of extending them, and adding a scope to `OIDC_RP_BASE_SCOPES` does not reach it.

The provider's client registration must allow every scope this yields. A provider supports `email`
as soon as it declares `claims.email` — and then rejects the whole request with
`invalid_scope: requested scope is not allowed` if the client's own allowlist omits it, rather than
dropping the scope. A client provisioned by an older revision stays broken until its allowlist is
backfilled.

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
| `${OIDC_TOKEN_STORE}:verifier:<challenge or state>` | The PKCE verifier and the client it belongs to, until the exchange takes it |
| `${OIDC_TOKEN_STORE}:exchange:<exchange token>` | The token set from a completed code exchange, short-lived, deleted when the process step consumes it |
| `${OIDC_TOKEN_STORE}:token:<bearer token>` | The live token set for an issued bearer token, saved with `OIDC_AUTH_LIFTETIME` |

A consumer that needs the provider token set behind the request it is serving reads
`context.resource(AUTH_CACHE)` at `${OIDC_TOKEN_STORE}:token:<token>` — never
`context.resource(OIDC_TOKEN_STORE)`, which resolves nothing.

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
  local identity through `@owlmeans/server-auth-identity`, must not adopt `appendOidcGuard()`,
  `makeOidcGate()` or `setupOidcGuard()` as its authorization mechanism. Those decide against the
  provider's grants; a product that owns its own identity records declares its own `GateService` over
  them.
- The browser starts the flow and the server finishes it: the exchange, the account linking and the
  bearer token an application actually carries are all produced here.
- Register the wrapping service whenever the guard is registered — an OIDC-wrapped token that nothing
  refreshes expires mid-session.

## Depends On

- `@owlmeans/oidc`, `@owlmeans/server-auth`, `@owlmeans/server-context`, `@owlmeans/server-entrypoint`,
  `@owlmeans/server-api`, `@owlmeans/auth`, `@owlmeans/auth-common`, `@owlmeans/basic-envelope`,
  `@owlmeans/client-entrypoint`, `@owlmeans/config`, `@owlmeans/context`, `@owlmeans/did`,
  `@owlmeans/entrypoint`, `@owlmeans/resource`, `@owlmeans/route`, `@noble/hashes`, `@scure/base`,
  `dayjs`
- `ajv` (peer)
- `openid-client@6.8.4` (exact), `jose@6.2.5` (exact) — see [[oidc-versions]]
