---
name: redis-resource
description: How to use @owlmeans/redis-resource — Redis-backed Resource implementation for caching/state with TTL, pub/sub, keyspace watching and streams. Auto-invoked when defining a resource backed by Redis.
user-invocable: false
---

# @owlmeans/redis-resource

**Layer:** Infra
**Install:** `"@owlmeans/redis-resource": "^0.1.18-rc.11"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeRedisResource<R>(alias, dbAlias?, serviceAlias?)` | Factory for a Redis-backed `Resource<R>`. Both alias defaults are `DEFAULT_DB_ALIAS` (`'redis'`) |
| `RedisResource<R>` | `Resource<R>` plus the `PubSubResource`, `WatchableResource` and `StreamResource` capabilities, `db`, `name` and `key(id?)` |
| `RedisDb`, `RedisClient`, `RedisDbService`, `RedisConnection` | The db and connection contracts — `@owlmeans/redis` implements them |
| `DEFAULT_DB_ALIAS`, `DEFAULT_PAGE_SIZE`, `SCAN_BATCH`, `READ_BATCH` | Constants for the record half |
| `STREAM_MAX_LENGTH`, `DEFAULT_STREAM_BLOCK`, `RECLAIM_IDLE`, `RECLAIM_COUNT`, `CONSUMER_ID_LENGTH` | Constants for the stream half |

Keys are namespaced by the db config's key prefix plus the resource's name:
`resource.key(id)` → `<prefix>-<name>:<id>`, and `key()` with no argument yields the namespace's
glob. The name is `resource.name` when set and the registration alias otherwise, so two resources
can share one namespace deliberately — and a `name` given by accident quietly merges two id spaces.
Every non-word character in either half is collapsed to `_`.

## Usage

```typescript
import { makeRedisResource } from '@owlmeans/redis-resource'

context.registerResource(makeRedisResource<SessionData>('sessions'))

// Type the RESOURCE once — never a method
const sessions = context.resource<RedisResource<SessionData>>('sessions')
await sessions.create({ id, token }, { ttl: 3600 })   // seconds, or a Date
const live = await sessions.load({ token })           // criteria, not just an id
```

TTL is a **per-call option** on `create` / `update` / `save`, not a property of the factory. The
prefix comes from the `dbs[]` config entry (`schema`), not from the resource.

## Reads: one key is cheap, everything else is a walk

`load(id)`, `get(id)`, `delete(id)`, `take(id)` are single-key commands.

`load(where)`, `get(where)`, `list`, `count` and `purge` walk the resource's **own namespace** with
`SCAN` + `MGET` and evaluate the criteria in memory with `firstMatch` / `filterRecords` /
`applyQuery` from `@owlmeans/resource` — the same engine every other store without a query planner
uses, so a criteria object means here exactly what it means in SQL. That is O(N) over the
namespace, and `{ sort }` orders the records after the walk, not in redis.

- Use it for a small namespaced set — a session cache, an OTP store, an adapter store.
- Never for an unbounded keyspace or a hot path. A resource that needs real queries belongs in
  mongo or postgres.
- `SCAN`, never `KEYS`: `KEYS` blocks the server for the whole sweep.
- The walk reaches one server, so `list` / `count` / `purge` are **not cluster-safe**. In a
  clustered deployment stay on the by-id operations.
- `load({ id })` is recognised and answered by key — the walk only starts for a real criteria.
- A key in the namespace holding something other than a string — this resource's own streams
  included — reads back as `null` from `MGET` and is skipped, so a stream never shows up as a
  record.

## Paging

Redis is **UNPAGED**: `DEFAULT_PAGE_SIZE` is `0`, `list(where)` with no `size` returns every match,
and `ListResult.total` always counts every match. `list(where, { page })` without a `size` throws
`UnsupportedArgumentError('page-without-size')` — there is no implied default to take a window of.

## TTL

| `opts.ttl` | Meaning | Command |
|---|---|---|
| `number` | seconds from now | `EXPIRE` |
| `Date` | the absolute instant to expire at | `PEXPIREAT` (milliseconds — what `Date.getTime()` gives) |
| omitted | persistent (`PTTL` reports `-1`) | — |

A `Date` already in the past drops the record immediately. `update` and `save` rewrite the key, so
a renewal must pass a TTL again — otherwise the record becomes persistent.

## Rules

- `delete(id)` returns the removed record or `null`; `take(id)` is the same read but **throws**
  `UnknownRecordError` when the key is gone. Both use `GETDEL`, so two callers can never be handed
  the same record. Choose by whether absence is an error.
- `create` generates an id when the record carries none, and refuses an id that is already there
  (`RecordExists`) using `SET NX` — no read-then-write race. The id is written into the stored
  record, so what comes back always carries one.
- `update` **replaces** the whole record and throws `UnknownRecordError` for an unknown id (and
  `MisshapedRecord` when the record carries no id at all). It does not merge over what was stored;
  pass every field that must survive.
- `save` creates when the record carries no id and replaces otherwise — that is the upsert.
- `purge(where)` refuses an empty criteria object. Use it instead of a page loop that deletes each
  item.
- `publish(value, channel?)` / `subscribe(handler, { channel?, once?, ttl? })` are channel pub/sub;
  the channel name is namespaced like a key, and an omitted channel listens to the resource's whole
  namespace. `watch(id, handler, { once?, ttl? })` is the keyspace-notification form for ONE
  record — the handler receives the current value on every write, and `null` once the key is gone.
  They are separate methods; a channel is never passed as a bare string.
- `watch` subscribes to `__keyspace@0__:`, while redis publishes keyspace events per database as
  `__keyspace@<db>__:`. So a resource on a connection whose `meta.dbIndex` is anything but 0 gets
  no notifications at all and its `watch` handler silently never fires — deployments sharing one
  instance isolate on the key prefix, not on the db index. The server also needs
  `notify-keyspace-events` enabled; it emits nothing otherwise.
- `stream(key, value)` appends to a namespaced redis stream, trimmed approximately to
  `STREAM_MAX_LENGTH` so trimming stays cheap. `consume(key, { group?, consumer?, block? })` is the
  async generator that reads it — with no `group` it tails from now with `XREAD`, with one it joins
  the consumer group and reclaims stale entries under the **passed** consumer name. Claiming them
  for a fixed name leaves them owned by a consumer that never reads.
- Requires redis 6.2 or newer (`GETDEL`).
- Assert an expiry by reading `PTTL` back from redis, never by trusting that a command was issued.
  An expiry set in the wrong unit is still an expiry — just one tens of millennia out — so only the
  value redis reports back proves anything.

## Tests

Integration specs live in the `@owlmeans/redis` package's own `tests/` — the db package that backs
this contract; putting them here would need a devDependency on this package's own dependent.
Gated on `REDIS_URL` (see `/.env.example`); each suite namespaces its keys and flushes them, and a
spec that walks the namespace boots under its own resource alias so it never sees another test's
records.

## Depends On

- `@owlmeans/resource` · `@owlmeans/context` · `@owlmeans/server-context` · `@owlmeans/basic-ids`
- peer `ioredis` (the client types every method is written against), `ajv`

`@owlmeans/redis` is NOT a dependency — it depends on this package, and that is the direction the
connection contracts flow in.

## Related

- `redis` — the connection service implementing `RedisDbService`, and the `cfg.dbs` entry a
  resource takes its prefix and db index from
- `redis-queue` — BullMQ queues on the same connections
- `resource` — the criteria language, paging and the error classes raised here
