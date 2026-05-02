---
description: "How to use @owlmeans/oidc — shared OIDC protocol abstractions including OIDC_GATE constant used in module gate() declarations."
applyTo: "**/*.ts, **/*.tsx"
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
import { OIDC_GATE } from '@owlmeans/oidc'
import { guard, gate } from '@owlmeans/module'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'

guard(DEFAULT_GUARD, gate(OIDC_GATE, [`my-service-account-{entity}`]))
```

## Depends On

- `@owlmeans/module`, `@owlmeans/route`, `@owlmeans/auth`
