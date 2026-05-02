---
name: web-oidc-rp
description: How to use @owlmeans/web-oidc-rp — browser OIDC relying party. appendOidcGuard() to wire the guard into a web context; setupOidcGuard() to wire it into module declarations. Auto-invoked when importing web-oidc-rp helpers.
user-invocable: false
---

# @owlmeans/web-oidc-rp

**Layer:** Web (React)
**Install:** `"@owlmeans/web-oidc-rp": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `appendOidcGuard<C, T>(context)` | Add OIDC guard to a web context |
| `setupOidcGuard(modules, options?, payloadOptions?)` | Wire OIDC guard onto module declarations |
| `service` | Web OIDC RP service (oidc-client-ts based) |
| `components` | Login / callback React components |
| Constants | OIDC client aliases |

## Subpath Exports

- `./auth/plugins` — pluggable token/session plugins

## Usage

### In `context.ts`
```typescript
import { appendOidcGuard } from '@owlmeans/web-oidc-rp'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg)
  appendOidcGuard<C, T>(context)
  return context
}
```

### In `modules.ts`
```typescript
import { setupOidcGuard } from '@owlmeans/web-oidc-rp'
setupOidcGuard(modules, undefined, { payload: { simplified: true } })
```

## Depends On

- `@owlmeans/oidc`, `@owlmeans/web-client`, `@owlmeans/web-panel`, `@owlmeans/client-auth`, `@owlmeans/auth-common`
- `oidc-client-ts` (runtime), `react` (peer)
