---
name: web-router
description: How to use @owlmeans/web-router — React Router v7 wrapper exposing the framework router service. Auto-invoked when importing the web router service.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-router

**Layer:** Web (React)
**Install:** `"@owlmeans/web-router": "^0.1.7"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeWebRouterService()` | React Router v7 wrapped as a router service |

## Usage

Usually wired transparently by `@owlmeans/web-client` / `@owlmeans/web-panel`. Register manually only if you need a custom router setup:

```typescript
import { makeWebRouterService } from '@owlmeans/web-router'
context.registerService(makeWebRouterService())
```

## Depends On

- `@owlmeans/router`, `@owlmeans/client`
- `react-router` (peer, pinned to v7)
