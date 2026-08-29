---
name: api
description: How to use @owlmeans/api — HTTP client service (axios-based) used to call entrypoints across services. Auto-invoked when importing the API service or when ctx.entrypoint(...).call() under the hood is involved.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/api

**Layer:** Core
**Install:** `"@owlmeans/api": "^0.1.18-rc.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeApiService()` | Factory for the HTTP client service (axios) |
| `Api` types | Service interface |
| Errors | Typed transport errors (Network, Timeout, HttpStatus) |
| Constants | Default timeout, retry counts |

## Usage

The api service backs `ctx.entrypoint<ClientEntrypoint<T>>(alias).call(...)` cross-service calls. Most apps don't import it directly — they register it once in their context factory:

```typescript
import { makeApiService } from '@owlmeans/api'
context.registerService(makeApiService())
```

## Depends On

- `@owlmeans/context` — service registration
- `@owlmeans/error`, `@owlmeans/i18n`
- `axios` (runtime)
