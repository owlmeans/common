---
name: server-module
description: How to use @owlmeans/server-module — server-side module helpers extending @owlmeans/module with handler attachment, request lifecycle hooks. Auto-invoked when importing server-module types.
user-invocable: false
---

# @owlmeans/server-module

**Layer:** Server
**Install:** `"@owlmeans/server-module": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ServerModule` types | Server module interface (handler + lifecycle) |
| Helpers | Attach handlers, hook into request lifecycle |

## Usage

Most app code uses `elevate()` from `@owlmeans/server-app` (which builds on this package). Import directly only when implementing custom module helpers.

```typescript
import type { ServerModule } from '@owlmeans/server-module'
```

## Depends On

- `@owlmeans/module`, `@owlmeans/server-route`, `@owlmeans/server-context`
