---
name: kluster
description: How to use @owlmeans/kluster — Kubernetes API client service. Resolve via context.service(DEFAULT_ALIAS) to access the cluster API for service discovery, secrets, config maps. Auto-invoked when interacting with the cluster from app code.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/kluster

**Layer:** Infra
**Install:** `"@owlmeans/kluster": "^0.1.18-rc.9"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `DEFAULT_ALIAS` | Service alias for the kluster service |
| `makeKlusterService()` | Factory for the Kubernetes client service |
| `Kluster` types | Service interface (k8s API access) |
| Helpers | Service discovery, secret resolution |

## Usage

```typescript
import { DEFAULT_ALIAS as KLUSTER_SERVICE } from '@owlmeans/kluster'
import { makeKlusterService } from '@owlmeans/kluster'

context.registerService(makeKlusterService())
context.kluster = () => context.service(KLUSTER_SERVICE)

// Later:
const k8s = ctx.kluster()
```

## Depends On

- `@owlmeans/server-context`, `@owlmeans/config`
- `@kubernetes/client-node` (runtime)
