---
name: server-route
description: How to use @owlmeans/server-route — server-side route resolution: turn route declarations into Express/Fastify routes. Auto-invoked when importing server-route helpers.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-route

**Layer:** Server
**Install:** `"@owlmeans/server-route": "^0.1.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ServerRoute` types | Resolved server-side route shape |
| Model | Route resolution helpers (path normalization, parent inheritance) |
| Constants | Default route prefixes |
| Helpers | Build server routes from declarations |

## Usage

This package is typically used internally by `@owlmeans/server-app` and `@owlmeans/server-entrypoint`. Import directly only for custom routing.

```typescript
import { resolveServerRoute } from '@owlmeans/server-route'
```

## Depends On

- `@owlmeans/route`, `@owlmeans/context`
