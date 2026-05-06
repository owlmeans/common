---
description: "How to use @owlmeans/server-oidc-rp — OIDC relying party. appendOidcGuard(), makeOidcWrappingService(), makeOidcGate(), setupOidcGuard() to wire OIDC into a server context."
applyTo: "**/context.ts, **/modules.ts, **/*.ts, **/*.tsx"
---

# @owlmeans/server-oidc-rp

**Layer:** Server
**Install:** `"@owlmeans/server-oidc-rp": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `appendOidcGuard<C, T>(context)` | Add OIDC auth guard to context |
| `makeOidcWrappingService()` | OIDC token service factory |
| `makeOidcGate()` | OIDC gate factory (used by guards) |
| `setupOidcGuard(modules, options?)` | Wire OIDC guard onto modules |
| Constants | OIDC service / guard aliases |
| `OidcRp` types | RP-side config and token shapes |

## Subpath Exports

- `./auth`, `./auth/plugins`

## Usage

```typescript
// context.ts
import { appendOidcGuard, makeOidcWrappingService, makeOidcGate } from '@owlmeans/server-oidc-rp'
context.registerService(makeOidcWrappingService())
context.registerService(makeOidcGate())
appendOidcGuard<C, T>(context)

// modules.ts
import { setupOidcGuard } from '@owlmeans/server-oidc-rp'
setupOidcGuard(appModules)

// config.ts
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

## Depends On

- `@owlmeans/oidc`, `@owlmeans/server-auth`, `@owlmeans/server-context`, `@owlmeans/server-module`, `@owlmeans/auth-common`, `@owlmeans/basic-keys`
