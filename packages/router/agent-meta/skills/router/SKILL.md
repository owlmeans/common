---
name: router
description: How to use @owlmeans/router — abstract router service interface used by web-router and native router implementations. Auto-invoked when importing router service types or implementing a custom router.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/router

**Layer:** Core
**Install:** `"@owlmeans/router": "^0.1.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `RouterService` types | Abstract router service interface |
| Constants | `DEFAULT_ALIAS` for the router service |
| Service helpers | Build a router service skeleton |

## Usage

Concrete routers (e.g. `@owlmeans/web-router` for React Router 7) implement this interface. Apps don't usually import from `@owlmeans/router` directly — the layer-specific package wires everything up.

```typescript
import { DEFAULT_ALIAS as ROUTER } from '@owlmeans/router'
const router = ctx.service(ROUTER)
router.navigate('/projects')
```

## Depends On

- `@owlmeans/context` — service registration
- `@owlmeans/route` — route shape
