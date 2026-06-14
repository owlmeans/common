---
description: "How to use @owlmeans/mongo — MongoDB client service factory (makeMongoService) registered on a server context."
applyTo: "**/context.ts, **/config.ts, **/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/mongo

**Layer:** Infra
**Install:** `"@owlmeans/mongo": "^0.1.9"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeMongoService()` | MongoDB connection service factory |
| `Mongo` types | Service interface, db handle |
| Constants | `DEFAULT_ALIAS` |

## Usage

```typescript
import { makeMongoService } from '@owlmeans/mongo'
context.registerService(makeMongoService())
```

## Depends On

- `@owlmeans/server-context`, `@owlmeans/resource`, `mongodb`
