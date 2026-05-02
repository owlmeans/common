---
description: "How to use @owlmeans/kluster — Kubernetes API client service. Resolve via context.service(DEFAULT_ALIAS) to access the cluster API for service discovery, secrets, config maps."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/kluster

**Layer:** Infra
**Install:** `"@owlmeans/kluster": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `DEFAULT_ALIAS` | Kluster service alias |
| `makeKlusterService()` | Kubernetes client service factory |
| `Kluster` types | Service interface |
| Helpers | Service discovery, secret resolution |

## Usage

```typescript
import { DEFAULT_ALIAS as KLUSTER_SERVICE, makeKlusterService } from '@owlmeans/kluster'

context.registerService(makeKlusterService())
context.kluster = () => context.service(KLUSTER_SERVICE)
```

## Depends On

- `@owlmeans/server-context`, `@owlmeans/config`, `@kubernetes/client-node`
