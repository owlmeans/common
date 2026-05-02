---
description: "How to use @owlmeans/auth-common — shared authentication guard aliases (DEFAULT_GUARD, GUARD_ED25519) and middleware shared between server and client. Use when declaring modules with guards."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/auth-common

**Layer:** Core
**Install:** `"@owlmeans/auth-common": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `DEFAULT_GUARD` | Alias for the default authentication guard |
| `GUARD_ED25519` | Alias for the Ed25519 signature guard |
| `AUTH_API` | Alias of the auth service module group |
| Auth modules | Shared module declarations registered in both server and client |
| Middleware | Cross-side auth middleware helpers |

## Subpath Exports

- `./utils` — shared auth utility functions

## Usage

```typescript
import { module, guard, gate } from '@owlmeans/module'
import { route } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { OIDC_GATE } from '@owlmeans/oidc'

module(
  route(manager.back.account.base, '/account'),
  guard(DEFAULT_GUARD, gate(OIDC_GATE, [`my-service-account-{entity}`]))
)
```

## Depends On

- `@owlmeans/auth` — types and errors
- `@owlmeans/module` — module/guard/gate helpers
