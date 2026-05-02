---
description: "How to use @owlmeans/client-auth — client-side auth manager and UI components, setupExternalAuthentication() to wire OAuth/OIDC flows."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/client-auth

**Layer:** Client
**Install:** `"@owlmeans/client-auth": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `setupExternalAuthentication(alias)` | Register OAuth/OIDC external auth flow |
| Auth components | Login UI primitives |
| Auth service | Client-side auth manager |
| Modules | Auth module declarations |
| Constants | Auth aliases |

## Subpath Exports

- `./manager`, `./manager/modules`, `./manager/plugins`

## Usage

```typescript
import { setupExternalAuthentication } from '@owlmeans/client-auth'
setupExternalAuthentication(AUTH_WEB)
```

## Depends On

- `@owlmeans/auth`, `@owlmeans/auth-common`, `@owlmeans/client-context`, `@owlmeans/client-module`, `react`
