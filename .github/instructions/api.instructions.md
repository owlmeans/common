---
description: "How to use @owlmeans/api — HTTP client service (axios-based) used to call modules across services."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/api

**Layer:** Core
**Install:** `"@owlmeans/api": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeApiService()` | Factory for the HTTP client service (axios) |
| `Api` types | Service interface |
| Errors | Typed transport errors |
| Constants | Default timeout, retry counts |

## Usage

```typescript
import { makeApiService } from '@owlmeans/api'
context.registerService(makeApiService())
```

## Depends On

- `@owlmeans/context`, `@owlmeans/error`, `@owlmeans/i18n`, `axios`
