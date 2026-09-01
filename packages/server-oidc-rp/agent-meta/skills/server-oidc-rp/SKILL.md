---
name: server-oidc-rp
description: How to use @owlmeans/server-oidc-rp — OIDC relying party. appendOidcGuard(), makeOidcWrappingService(), makeOidcGate() to wire OIDC into a server context; setupOidcGuard() to attach the guard to module declarations. Auto-invoked when importing server-oidc-rp helpers.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-oidc-rp

**Layer:** Server
**Install:** `"@owlmeans/server-oidc-rp": "^0.1.18-rc.15"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `appendOidcGuard<C, T>(context)` | Add OIDC auth guard to context |
| `makeOidcWrappingService()` | OIDC token service factory |
| `makeOidcGate()` | OIDC gate factory (used by guards) |
| `setupOidcGuard(modules, options?)` | Wire OIDC guard onto module declarations |
| `requestedScope(extraScopes?)` | The `scope` of an authorization request — base scopes + provider extras |
| Constants | OIDC service / guard aliases |
| `OidcRp` types | RP-side config and token shapes |

## Requested scope

Every authorization request this package builds gets its `scope` from `requestedScope(cfg.extraScopes)`
— `OIDC_RP_BASE_SCOPES` (`@owlmeans/oidc`) plus the provider descriptor's `extraScopes`, deduplicated.
Both request sites (`actions/init.ts` for the browser-starts-server-finishes flow, and the
`oidc-client` auth plugin) call it; never write a scope literal at a call site, and never let the two
drift apart.

The provider's client registration must allow every scope this yields. A provider supports `email`
as soon as it declares `claims.email` — and then rejects the whole request with
`invalid_scope: requested scope is not allowed` if the client's own allowlist omits it, rather than
dropping the scope. A client provisioned by an older revision therefore stays broken until its
allowlist is backfilled.

## Subpath Exports

- `./auth` — auth integration helpers
- `./auth/plugins` — pluggable token verifiers

## Usage

### In `context.ts`
```typescript
import { appendOidcGuard, makeOidcWrappingService, makeOidcGate } from '@owlmeans/server-oidc-rp'

context.registerService(makeOidcWrappingService())
context.registerService(makeOidcGate())
appendOidcGuard<C, T>(context)
```

### In `modules.ts`
```typescript
import { setupOidcGuard } from '@owlmeans/server-oidc-rp'
setupOidcGuard(appModules)
```

### Configure OIDC providers in `config.ts`
```typescript
cfg.oidc ??= {}
cfg.oidc.providers ??= []
cfg.oidc.providers.push({
  clientId: OIDC_ADMIN_CLIENT,
  basePath: 'realms/master',
  service: OIDC_PRODUCT,
  secret: '/etc/master-secret/oidc-admin-secret',
  internal: true
})
```

## Product-Viable Usage Notes

- Viable uses `makeOidcClientService()` to read provider descriptors from `cfg.oidc.providers`, including Google and internal admin providers.
- `findProvider(predicate)`, `hasProvider(params)`, and `entityToClientId(params)` are the preferred provider lookup helpers; avoid scanning config ad hoc in downstream code.
- `setupAuthServiceModules(managerModules, AUTH_API)` exposes provider-list and token-update service modules protected by `GUARD_ED25519`.
- When a downstream app uses OIDC/Google only for login and maps users into `@owlmeans/server-auth-identity`, do not reintroduce `appendOidcGuard()`, `makeOidcGate()`, or `setupOidcGuard()` as product authorization. Use a product-specific `GateService` over local identity data.

## Only the `id_token` is a JWT

`id_token` is a JWT by specification; an **access token's format is provider-private**. `oidc-provider`
issues opaque access tokens by default, so `decodeJwt(tokenSet.access_token)` (`jose`) throws
`JWTInvalid: Invalid JWT`. Inside the exchange handler that failure surfaces as a 500 on
`/authenticate/oidc/process` *after* the code exchange already succeeded, which reads as a broken
login rather than as the log line it came from. Decode only `tokenSet.id_token` — every claim this
package needs (`sub`, the `PERMISSIONS_CLAIM` grant) lives there. This applies to debug logging too:
a `console.log` argument is evaluated before the call, so a throwing decode in a log statement fails
the request just as hard as one in real logic. Never introspect an access token locally; use the
provider's introspection endpoint (`tokenIntrospection`) when its contents are genuinely needed.

## Gotcha: `entityId` in the browser-starts-server-finishes flow

`actions/init.ts` resolves the OIDC client two ways: via `oidc.getDefault()` (a provider flagged
`def: true`, matched without looking at `entityId` at all) or, only when no default exists, via a
remote provider lookup keyed by the caller-supplied `entityId`. The verifier record it caches must
only carry `entityId` when the **second** path actually used it to resolve the client — never
unconditionally. `utils/auth.ts`'s exchange step later does
`getConfig({ clientId: verification.client, ...(verification.entityId != null ? { entityId: ... } : {}) })`,
which requires an **exact** match on every field it's given; a stored `entityId` that was never
validated against the registered provider (e.g. a caller-side default/placeholder value) makes the
exchange fail with a bare `AuthenFailed()` even though the same default provider that worked at
init time is trivially available again at exchange time. Fixed 2026-08-17 — if this regresses, check
that the default-provider fast path in `actions/init.ts` still omits `entityId` from the cached
verifier.

## Public type contract (isolation principle)

`openid-client` types **never appear in this package's public exports**. All public types are OwlMeans-owned:

| Owned type | Replaces upstream | Description |
|---|---|---|
| `OidcTokenSet` | `TokenEndpointResponse & TokenEndpointResponseHelpers` | `access_token`, `refresh_token`, `id_token`, `token_type`, `expires_in`, `scope` |
| `OidcTokenSetParameters` | `TokenEndpointResponse` | Subset without helper methods |
| `OidcGrantChecks` | `AuthorizationCodeGrantChecks` | `{ pkceCodeVerifier?: string; idTokenExpected?: boolean }` |
| `OidcServerMetadata` | `ServerMetadata` | Issuer and endpoint metadata |
| `OidcIntrospectionResponse` | `IntrospectionResponse` | Active, scope, sub, client_id |
| `OidcClientDescriptor` | `Configuration` (opaque) | Pass-through; consumers must never read its internals |

Upstream `openid-client` types are imported **only** in `src/service.ts`; mappings happen at the method boundaries. This keeps future library swaps confined to that one file.

## Depends On

- `@owlmeans/oidc`, `@owlmeans/server-auth`, `@owlmeans/server-context`, `@owlmeans/server-entrypoint`
- `@owlmeans/auth-common`, `@owlmeans/basic-keys`
- `openid-client@6.8.4` (exact), `jose@6.2.3` (exact) — see [[oidc-versions]]
