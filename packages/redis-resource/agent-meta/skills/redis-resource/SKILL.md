---
name: redis-resource
description: How to use @owlmeans/redis-resource — Redis-backed Resource implementation for caching/state with TTL support. Auto-invoked when defining a resource backed by Redis.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/redis-resource

**Layer:** Infra
**Install:** `"@owlmeans/redis-resource": "^0.1.18-rc.6"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeRedisResource<R>(alias, dbAlias?, serviceAlias?, makeCustomResource?)` | Factory for a Redis-backed `Resource<R>`. Both alias defaults are `DEFAULT_DB_ALIAS` (`'redis'`) |
| `RedisResource<R>`, `RedisDb`, `RedisClient`, `RedisDbService` | Types |
| `DEFAULT_DB_ALIAS`, `DEFAULT_PAGE_SIZE` | Constants |

Keys are namespaced by the db config's `schema`: `resource.key(id)` → `<prefix>:<id>`.

## Usage

```typescript
import { makeRedisResource } from '@owlmeans/redis-resource'

context.registerResource(makeRedisResource<SessionData>('sessions'))

const sessions = context.resource<RedisResource<SessionData>>('sessions')
await sessions.create({ id, token }, { ttl: 3600 })   // seconds, or a Date
```

TTL is a **per-call option** on `create`/`update`, not a property of the factory. The prefix
comes from the `dbs[]` config entry (`schema`), not from the resource.

## TTL

| `opts.ttl` | Meaning | Command |
|---|---|---|
| `number` / numeric `string` | seconds from now | `EXPIRE` |
| `Date` | the absolute instant to expire at | `PEXPIREAT` (milliseconds — what `Date.getTime()` gives) |
| omitted | persistent (`PTTL` reports `-1`) | — |

A `Date` already in the past drops the record immediately. `update` re-applies the TTL, so a
renewal must pass one again — otherwise the key keeps whatever expiry it had.

## Rules

- `delete(id)` — the plain by-id form — is the normal call and must remove the key. It returns the
  removed record, or `null` when the id was not there. `pick(id)` is delete-and-return that
  *throws* `UnknownRecordError` when the key is gone; choose by whether absence is an error.
- `create` throws `RecordExists` when the id is present. For an upsert, use `save` (load → update
  or create) rather than delete-then-create; the latter turns any lost delete into a hard failure
  on the next write.
- `load` rejects an `opts` argument (`UnsupportedArgumentError`) — pass only `id` and an optional
  field name.
- `list` walks `KEYS <prefix>:*`. Fine for small, namespaced sets; never for a hot path or an
  unbounded keyspace.
- `subscribe` relies on keyspace notifications, which are bound to **db 0** — deployments sharing
  one instance must isolate on the key prefix, not on the db index.
- Assert an expiry by reading `PTTL` back from redis, never by trusting that a command was issued —
  the unit bug this contract had still "set an expiry", just one ~50 millennia away.

## Depends On

- `@owlmeans/redis`, `@owlmeans/resource`, `@owlmeans/server-context`

## Tests

Integration specs live in `@owlmeans/redis` (`packages/redis/tests/`) — the db package that backs
this contract; putting them here would need a devDependency on this package's own dependent.
Gated on `REDIS_URL` (see `/.env.example`); each suite namespaces its keys and flushes them.
