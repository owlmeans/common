---
description: "How to use @owlmeans/server-auth — server-side authentication manager, AUTH_API alias, setupAuthServiceModules() to wire auth modules."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/server-auth

**Layer:** Server
**Install:** `"@owlmeans/server-auth": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `setupAuthServiceModules(modules, alias)` | Wire auth modules into app modules |
| `AUTH_API` (re-exported) | Auth service alias |
| Auth service factory | Backend auth manager |
| Plugin types | Pluggable auth verifiers |

## Subpath Exports

- `./manager`, `./manager/plugins`

## Usage

```typescript
import { setupAuthServiceModules } from '@owlmeans/server-auth'
import { AUTH_API } from '@owlmeans/auth-common'
setupAuthServiceModules(appModules, AUTH_API)
```

## Depends On

- `@owlmeans/auth`, `@owlmeans/auth-common`, `@owlmeans/server-module`, `@owlmeans/server-context`, `@owlmeans/basic-keys`
