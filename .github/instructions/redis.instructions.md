---
description: "How to use @owlmeans/redis — Redis client service factory (makeRedisService) registered on a server context."
applyTo: "**/context.ts, **/config.ts, **/*.ts, **/*.tsx"
---

# @owlmeans/redis

**Layer:** Infra
**Install:** `"@owlmeans/redis": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeRedisService()` | Redis connection service factory |
| `Redis` types | Service interface |
| Constants | `DEFAULT_ALIAS` |

## Usage

```typescript
import { makeRedisService } from '@owlmeans/redis'
context.registerService(makeRedisService())
```

## Depends On

- `@owlmeans/server-context`, `@owlmeans/resource`, `ioredis`
