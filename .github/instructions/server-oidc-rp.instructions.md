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

## Depends On

- `@owlmeans/oidc`, `@owlmeans/server-auth`, `@owlmeans/server-context`, `@owlmeans/server-module`, `@owlmeans/auth-common`, `@owlmeans/basic-keys`
