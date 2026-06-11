---
name: server-oidc-rp
description: How to use @owlmeans/server-oidc-rp — OIDC relying party. appendOidcGuard(), makeOidcWrappingService(), makeOidcGate() to wire OIDC into a server context; setupOidcGuard() to attach the guard to module declarations. Auto-invoked when importing server-oidc-rp helpers.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-oidc-rp

**Layer:** Server
**Install:** `"@owlmeans/server-oidc-rp": "^0.1.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `appendOidcGuard<C, T>(context)` | Add OIDC auth guard to context |
| `makeOidcWrappingService()` | OIDC token service factory |
| `makeOidcGate()` | OIDC gate factory (used by guards) |
| `setupOidcGuard(modules, options?)` | Wire OIDC guard onto module declarations |
| Constants | OIDC service / guard aliases |
| `OidcRp` types | RP-side config and token shapes |

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
