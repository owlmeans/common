---
name: redis
description: How to use @owlmeans/redis — Redis client service factory (makeRedisService) registered on a server context. Auto-invoked when wiring Redis into a server app.
user-invocable: false
---

# @owlmeans/redis

**Layer:** Infra
**Install:** `"@owlmeans/redis": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeRedisService()` | Factory for the Redis connection service |
| `Redis` types | Service interface, client handle |
| Constants | `DEFAULT_ALIAS` for the redis service |

## Usage

```typescript
import { makeRedisService } from '@owlmeans/redis'
context.registerService(makeRedisService())

// Connection settings via cfg.services / cfg.dbs
```

## Depends On

- `@owlmeans/server-context`, `@owlmeans/resource`
- `ioredis` (runtime)
