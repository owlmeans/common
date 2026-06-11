---
name: redis-resource
description: How to use @owlmeans/redis-resource — Redis-backed Resource implementation for caching/state with TTL support. Auto-invoked when defining a resource backed by Redis.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/redis-resource

**Layer:** Infra
**Install:** `"@owlmeans/redis-resource": "^0.1.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeRedisResource<T>(options)` | Factory for a Redis-backed Resource<T> |
| `RedisResource<T>` types | Resource interface (with TTL) |
| Constants | Default key prefix |

## Usage

```typescript
import { makeRedisResource } from '@owlmeans/redis-resource'

context.registerResource(makeRedisResource<SessionData>({
  alias: 'sessions',
  prefix: 'sess:',
  ttl: 3600,
}))
```

## Depends On

- `@owlmeans/redis`, `@owlmeans/resource`, `@owlmeans/server-context`
