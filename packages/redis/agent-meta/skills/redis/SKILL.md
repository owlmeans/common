---
name: redis
description: How to use @owlmeans/redis — Redis client service factory (makeRedisService) registered on a server context. Auto-invoked when wiring Redis into a server app.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/redis

**Layer:** Infra
**Install:** `"@owlmeans/redis": "^0.1.18-rc.12"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeRedisService()` | Factory for the Redis connection service |
| `Redis` types | Service interface, client handle |
| `service.options(alias?)` | The connection settings behind an alias — `{ single? , cluster?, prefix }` |
| Constants | `DEFAULT_ALIAS` for the redis service |

## Usage

```typescript
import { appendRedis, makeRedisService } from '@owlmeans/redis'
context.registerService(makeRedisService())   // or appendRedis(context)

// Connection settings via cfg.dbs — a LIST of DbConfig entries
```

`options(alias)` hands out the settings rather than a client, because a consumer that BLOCKS on a
read holds its connection for the duration and so cannot share the pooled one. Anything doing that
— BullMQ's workers and event streams, for instance — builds its own client from these settings,
which keeps the configuration here instead of being re-derived from `cfg.dbs` and drifting.

`cfg.dbs[].schema` is the key prefix; every resource on the connection namespaces itself as
`<schema>-<resource alias>:<id>`. Choose the database index with `meta.dbIndex` (a string is
accepted, so it can come from a file-mounted config value), never ioredis' own `db`.

## Server Requirements

- Redis **6.2 or newer** — `@owlmeans/redis-resource` deletes with `GETDEL`, which is the whole
  reason `delete`/`take` hand back the record they removed without a preceding read.
- `notify-keyspace-events` enabled if any resource uses `watch`. Keyspace events are emitted on
  **db 0**, so deployments sharing one instance isolate on the key prefix, not on `dbIndex`.
- **A single server for anything answering criteria.** A resource answers `list`/`count`/`purge`
  and `load(where)` by walking its own prefix with `SCAN`, which reaches one server — so in a
  clustered deployment those calls see a fraction of the keyspace. Keep clustered resources on the
  by-id operations, or put the data in mongo or postgres.

## Tests

This package's `tests/` hold the integration specs for the `@owlmeans/redis-resource` contract —
it supplies the connection they run against. Gated on `REDIS_URL` (see `/.env.example`).

## Depends On

- `@owlmeans/server-context`, `@owlmeans/resource`, `@owlmeans/redis-resource`
- `ioredis` (runtime)
