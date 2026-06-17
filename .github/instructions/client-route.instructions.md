---
description: "How to use @owlmeans/client-route — client-side route resolution that turns route declarations into navigation paths."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/client-route

**Layer:** Client
**Install:** `"@owlmeans/client-route": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ClientRoute` types | Resolved client route shape |
| Helpers | Build client routes |
| Model | Path normalization |

## Usage

```typescript
import { resolveClientRoute } from '@owlmeans/client-route'
```

## Depends On

- `@owlmeans/route`, `@owlmeans/router`
