---
description: "How to use @owlmeans/web-router — React Router v7 wrapper exposing the framework router service."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-router

**Layer:** Web (React)
**Install:** `"@owlmeans/web-router": "^0.1.10"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeWebRouterService()` | React Router v7 wrapped as a router service |

## Usage

```typescript
import { makeWebRouterService } from '@owlmeans/web-router'
context.registerService(makeWebRouterService())
```

## Depends On

- `@owlmeans/router`, `@owlmeans/client`, `react-router`
