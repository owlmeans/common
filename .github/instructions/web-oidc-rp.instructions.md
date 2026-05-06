---
description: "How to use @owlmeans/web-oidc-rp — browser OIDC relying party. appendOidcGuard() to wire the guard into a web context; setupOidcGuard() to wire it into module declarations."
applyTo: "**/context.ts, **/modules.ts, **/*.ts, **/*.tsx"
---

# @owlmeans/web-oidc-rp

**Layer:** Web (React)
**Install:** `"@owlmeans/web-oidc-rp": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `appendOidcGuard<C, T>(context)` | Add OIDC guard to a web context |
| `setupOidcGuard(modules, options?, payloadOptions?)` | Wire OIDC guard onto modules |
| `service` | Web OIDC RP service (oidc-client-ts based) |
| `components` | Login / callback components |
| Constants | OIDC client aliases |

## Subpath Exports

- `./auth/plugins`

## Usage

```typescript
// context.ts
import { appendOidcGuard } from '@owlmeans/web-oidc-rp'
appendOidcGuard<C, T>(context)

// modules.ts
import { setupOidcGuard } from '@owlmeans/web-oidc-rp'
setupOidcGuard(modules, undefined, { payload: { simplified: true } })
```

## Product-Viable Usage Notes

- Importing `@owlmeans/web-oidc-rp/auth/plugins` registers both `OIDC_CLIENT_AUTH` and `GOOGLE_CLIENT_AUTH` plugins into the `@owlmeans/client-auth` plugin registry.
- The Google plugin uses `useValue` to manage redirect side effects, persists auth control state before redirect, restores it on return, then submits URL query params as `AuthCredentials`.
- The browser plugin starts login; the server finalizes provider exchange, links local identity, and returns a normal bearer token.
- Do not encode product authorization in browser OIDC plugins. Server module gates and local identity profiles remain the authorization source.

## Depends On

- `@owlmeans/oidc`, `@owlmeans/web-client`, `@owlmeans/web-panel`, `@owlmeans/client-auth`, `@owlmeans/auth-common`, `oidc-client-ts`, `react`
