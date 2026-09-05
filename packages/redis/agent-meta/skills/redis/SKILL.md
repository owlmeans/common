---
name: redis
description: How to use @owlmeans/redis — the Redis connection service (makeRedisService / appendRedis) registered on a server context, its cfg.dbs configuration, the options() seam for consumers that need a connection of their own, and the cluster caveat. Auto-invoked when wiring Redis into a server app.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/redis

**Layer:** Infra
**Install:** `"@owlmeans/redis": "^0.1.18-rc.12"` in `dependencies`

The connection half. The `Resource` contract over those connections is `@owlmeans/redis-resource`;
queues on them are `@owlmeans/redis-queue`.

## Key Exports

| Export | Description |
|--------|-------------|
| `appendRedis(context, alias?)` | Register the service — the usual wiring |
| `makeRedisService(alias?)` | The bare factory, when registering it yourself |
| `RedisMeta` | What `cfg.dbs[].meta` accepts here: `dbIndex`, `masterNumber`, `slaveNumber`, plus any ioredis option |
| Constants | `DEFAULT_ALIAS` (`redis`, shared with `@owlmeans/redis-resource`) |

The service interface itself (`RedisDbService`, `RedisClient`, `RedisDb`, `RedisConnection`) is
declared in `@owlmeans/redis-resource`, so a consumer types against the contract package rather
than against the driver.

## Usage

```typescript
import { appendRedis } from '@owlmeans/redis'

appendRedis(context)
```

```typescript
const redis = context.service<RedisDbService>(DEFAULT_ALIAS)
await redis.ready()
const client = await redis.client()          // the pooled connection
const { single, cluster, prefix } = redis.options()
```

Connections are configured through `cfg.dbs` — a LIST of `DbConfig` entries, each naming the
`service` that owns it and the `alias` it answers to. Every entry for this service is resolved when
the service initializes, and its client is closed on SIGTERM.

| Field | Meaning |
|---|---|
| `host` | A string for a single server; an ARRAY makes it a cluster (see below) |
| `port` | Defaults to 6379 |
| `secret` | The password |
| `user` | Sent as ioredis' `username` **only when set** — a bare `requirepass` server rejects AUTH with a username, so leave it absent unless the server has ACL users |
| `schema` | The key prefix, falling back to the entry's `alias` and then the service's. Every resource on the connection namespaces itself `<prefix>-<resource name>:<id>` |
| `meta.dbIndex` | The database index (`SELECT n`). Accepts a string, so it can come from a file-mounted config value; never use ioredis' own `db` |

**A `dbIndex` other than 0 turns `watch` off.** Redis publishes keyspace events per database, as
`__keyspace@<db>__:<key>`, and `@owlmeans/redis-resource` subscribes to `__keyspace@0__:` — so on
any other index a resource's `watch` handler silently never fires. Deployments sharing one instance
isolate on the key prefix (`schema`), and leave `dbIndex` alone wherever anything watches.

## `options()` versus `client()`

`options(alias)` hands out the settings rather than a client, because a consumer that BLOCKS on a
read holds its connection for the duration and so cannot share the pooled one. Anything doing that
— BullMQ's workers and event streams, for instance — builds its own client from these settings,
which keeps the configuration here instead of being re-derived from `cfg.dbs` and drifting. It
answers `{ single, prefix }` for one host and `{ cluster, prefix }` for several; exactly one of the
two is present, which is how a consumer that cannot work on a cluster refuses at connection time.

## Server Requirements

- Redis **6.2 or newer** — `@owlmeans/redis-resource` deletes with `GETDEL`, which is the whole
  reason `delete`/`take` hand back the record they removed without a preceding read.
- `notify-keyspace-events` enabled if any resource uses `watch` — redis publishes nothing
  otherwise.
- **A single server for anything answering criteria.** A resource answers `list`/`count`/`purge`
  and `load(where)` by walking its own prefix with `SCAN`, which reaches one server — so in a
  clustered deployment those calls see a fraction of the keyspace. Keep clustered resources on the
  by-id operations, or put the data in mongo or postgres. Queues refuse a cluster outright.

## A multi-host entry OWNS its cluster

A `dbs[]` entry whose `host` is an array of more than one does not merely connect: it asserts the
topology. It MEETs the nodes it was given, FORGETs the ones it was not, and where the layout does
not match `meta.masterNumber` / `meta.slaveNumber` it resets nodes and reassigns slot ranges —
which flushes them. Point such an entry only at a cluster this service is meant to own; for a
cluster managed elsewhere, or for a single server, give `host` one string. (A one-element array
collapses to a single connection and is safe.)

## Tests

This package's `tests/` hold the integration specs for the `@owlmeans/redis-resource` contract —
it supplies the connection they run against. Gated on `REDIS_URL` (see `/.env.example`); run them
with `bun test ./tests`.

## Depends On

- `@owlmeans/redis-resource` — the service and resource contracts, and `DEFAULT_DB_ALIAS`
- `@owlmeans/resource` — `createDbService`, `DbConfig`
- `@owlmeans/server-context` — the config and context this service binds to
- `ioredis` (runtime)

## Related

- `redis-resource` — records, TTL, pub/sub, keyspace watching and streams over these connections
- `redis-queue` — BullMQ queues over them
