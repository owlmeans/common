---
name: server-auth
description: How to use @owlmeans/server-auth — server-side authentication manager, AUTH_API alias, setupAuthServiceModules() to wire auth modules into your app. Auto-invoked when importing auth manager primitives.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-auth

**Layer:** Server
**Install:** `"@owlmeans/server-auth": "^0.1.15"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `setupAuthServiceModules(modules, alias)` | Wire auth modules into your app modules array |
| `AUTH_API` (re-exported) | Auth service alias |
| Auth service factory | Backend auth manager |
| Plugin types | Pluggable auth verifiers |

## Subpath Exports

- `./manager` — auth manager service implementation
- `./manager/plugins` — pluggable manager plugins

## Usage

```typescript
import { setupAuthServiceModules } from '@owlmeans/server-auth'
import { AUTH_API } from '@owlmeans/auth-common'

setupAuthServiceModules(appModules, AUTH_API)
```

## Product-Viable Usage Notes

- Backend context registers `appendAuthService(context)` before identity resources and product-specific gate services.
- `AUTH_CACHE` must be registered as a Redis resource when the backend context does not rely on the default `server-app` setup.
- `server-auth` verifies bearer tokens and populates `req.auth`; it does not decide product ownership or permissions by itself.
- Pair this package with `@owlmeans/server-auth-identity` when an external provider such as Google should map into local account/profile/credentials records.
- Pair it with `@owlmeans/entrypoint` gates for authorization, and keep handler-level `entityId` checks as a second line of defense.

## Depends On

- `@owlmeans/auth`, `@owlmeans/auth-common`
- `@owlmeans/server-entrypoint`, `@owlmeans/server-context`
- `@owlmeans/basic-keys` — Ed25519 verification
