---
description: "How to use @owlmeans/router — abstract router service interface used by web-router and native router implementations. Use when implementing a custom router."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/router

**Layer:** Core
**Install:** `"@owlmeans/router": "^0.1.7"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `RouterService` types | Abstract router service interface |
| Constants | `DEFAULT_ALIAS` for the router service |
| Service helpers | Build a router service skeleton |

## Usage

```typescript
import { DEFAULT_ALIAS as ROUTER } from '@owlmeans/router'
const router = ctx.service(ROUTER)
router.navigate('/projects')
```

## Depends On

- `@owlmeans/context`, `@owlmeans/route`
