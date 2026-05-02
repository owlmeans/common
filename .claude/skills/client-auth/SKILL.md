---
name: client-auth
description: How to use @owlmeans/client-auth — client-side auth manager and UI components, setupExternalAuthentication() to wire OAuth/OIDC flows. Auto-invoked when importing client-auth helpers or registering external authentication.
user-invocable: false
---

# @owlmeans/client-auth

**Layer:** Client
**Install:** `"@owlmeans/client-auth": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `setupExternalAuthentication(alias)` | Register OAuth/OIDC external auth flow module |
| Auth components | Login UI primitives |
| Auth service | Client-side auth manager service |
| Modules | Auth module declarations |
| Constants | Auth aliases (re-exports `AUTH_API`) |

## Subpath Exports

- `./manager` — client-side auth manager
- `./manager/modules` — manager module declarations
- `./manager/plugins` — pluggable token providers

## Usage

```typescript
import { setupExternalAuthentication } from '@owlmeans/client-auth'

setupExternalAuthentication(AUTH_WEB) // alias of the web auth service
```

## Depends On

- `@owlmeans/auth`, `@owlmeans/auth-common`
- `@owlmeans/client-context`, `@owlmeans/client-module`
- `react` (peer)
