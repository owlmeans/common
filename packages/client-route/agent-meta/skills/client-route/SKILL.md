---
name: client-route
description: How to use @owlmeans/client-route — client-side route resolution that turns route declarations into navigation paths. Auto-invoked when importing client route helpers.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-route

**Layer:** Client
**Install:** `"@owlmeans/client-route": "^0.1.18-rc.0"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ClientRoute` types | Resolved client-side route shape |
| Helpers | Build client routes from declarations |
| Model | Path normalization, parent inheritance |

## Usage

Most app code uses route declarations from `@owlmeans/route` and lets `@owlmeans/web-router` consume them. Import here only for custom routing.

```typescript
import { resolveClientRoute } from '@owlmeans/client-route'
```

## Depends On

- `@owlmeans/route`, `@owlmeans/router`
