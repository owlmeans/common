---
description: "How to use @owlmeans/redis-resource — Redis-backed Resource implementation for caching/state with TTL support."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/redis-resource

**Layer:** Infra
**Install:** `"@owlmeans/redis-resource": "^0.1.7"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeRedisResource<T>(options)` | Redis-backed Resource factory |
| `RedisResource<T>` types | Resource interface |
| Constants | Default key prefix |

## Usage

```typescript
import { makeRedisResource } from '@owlmeans/redis-resource'
context.registerResource(makeRedisResource<SessionData>({ alias: 'sessions', prefix: 'sess:', ttl: 3600 }))
```

## Depends On

- `@owlmeans/redis`, `@owlmeans/resource`, `@owlmeans/server-context`
