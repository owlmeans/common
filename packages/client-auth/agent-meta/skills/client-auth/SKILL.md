---
name: client-auth
description: How to use @owlmeans/client-auth — client-side auth manager and UI components, setupExternalAuthentication() to wire OAuth/OIDC flows. Auto-invoked when importing client-auth helpers or registering external authentication.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-auth

**Layer:** Client
**Install:** `"@owlmeans/client-auth": "^0.1.16"` in `dependencies`

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

## Product-Viable Usage Notes

- The manager web app imports `DEFAULT_ALIAS` from `@owlmeans/client-auth` as the client-side equivalent of `DEFAULT_GUARD`.
- It imports `@owlmeans/web-oidc-rp/auth/plugins` for side effects; that registers OIDC and Google authentication plugins in the client auth manager.
- During Google/OIDC redirects, plugins persist the client auth control state, restore it on return, then submit `AuthCredentials` to the server auth flow.
- The browser receives and stores a normal OwlMeans bearer token. Product authorization remains server-side through module gates and handler checks, not through client-only state.

## Depends On

- `@owlmeans/auth`, `@owlmeans/auth-common`
- `@owlmeans/client-context`, `@owlmeans/client-entrypoint`
- `react` (peer)
