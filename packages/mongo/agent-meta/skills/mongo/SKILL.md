---
name: mongo
description: How to use @owlmeans/mongo — MongoDB client service factory (makeMongoService) registered on a server context. Auto-invoked when wiring MongoDB into a server app.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/mongo

**Layer:** Infra
**Install:** `"@owlmeans/mongo": "^0.1.7"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeMongoService()` | Factory for the MongoDB connection service |
| `Mongo` types | Service interface, db handle |
| Constants | `DEFAULT_ALIAS` for the mongo service |

## Usage

```typescript
import { makeMongoService } from '@owlmeans/mongo'
context.registerService(makeMongoService())

// Connection settings come from cfg.services / cfg.dbs
cfg.dbs = [{
  service: 'mongo',
  host: 'mongodb://localhost',
  database: 'my-app',
}]
```

## Depends On

- `@owlmeans/server-context`, `@owlmeans/resource`
- `mongodb` (runtime)
