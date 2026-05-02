---
name: client-module
description: How to use @owlmeans/client-module — client-side module helpers extending @owlmeans/module with React component attachment and call helpers. Auto-invoked when importing client module helpers.
user-invocable: false
---

# @owlmeans/client-module

**Layer:** Client
**Install:** `"@owlmeans/client-module": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ClientSideModule` types | Client module interface (handler component + call helpers) |
| Module helpers | Build client modules; resolve callable references |

## Subpath Exports

- `./utils`

## Usage

Most app code uses `elevate()` from `@owlmeans/web-client` (which builds on this). Use this directly only for cross-platform module helpers.

```typescript
import type { ClientSideModule } from '@owlmeans/client-module'
```

## Depends On

- `@owlmeans/module`, `@owlmeans/client-route`, `@owlmeans/client-context`
