---
description: "How to use @owlmeans/server-module — server-side module helpers extending @owlmeans/module with handler attachment and request lifecycle hooks."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/server-module

**Layer:** Server
**Install:** `"@owlmeans/server-module": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ServerModule` types | Server module interface |
| Helpers | Attach handlers, hook lifecycle |

## Usage

```typescript
import type { ServerModule } from '@owlmeans/server-module'
// Most code uses elevate() from @owlmeans/server-app instead
```

## Depends On

- `@owlmeans/module`, `@owlmeans/server-route`, `@owlmeans/server-context`
