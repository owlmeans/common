---
name: oidc
description: How to use @owlmeans/oidc — shared OIDC protocol abstractions including OIDC_GATE constant used in module gate() declarations. Auto-invoked when importing OIDC types/constants or wiring OIDC into a guard().
user-invocable: false
---

# @owlmeans/oidc

**Layer:** Core
**Install:** `"@owlmeans/oidc": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `OIDC_GATE` | Gate alias to pass to `gate(...)` inside `guard(...)` |
| `OidcGuard` types | Guard payload shapes |
| Modules | Shared OIDC module declarations |
| Models | Token/profile shapes |

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

The actual OIDC verification happens in `@owlmeans/server-oidc-rp` (server) and `@owlmeans/web-oidc-rp` (browser). The `oidc` package gives both sides a shared name to refer to.

## Depends On

- `@owlmeans/module`, `@owlmeans/route`, `@owlmeans/auth`
