# @owlmeans/redis-resource

Redis-backed `Resource<T>` for server apps, with pub/sub, keyspace watching and streams. Use it
when data has a Redis-shaped property:
- **Expiry**: sessions, OTPs, nonces, idempotency keys.
- **Cache**: a miss must stay invisible to the user.
- **Lock or counter.**
- **Fan-out between processes**: pub/sub channels and streams.

It is never the source of truth, and it does not fit an unbounded keyspace, because anything other
than a read by id walks the namespace. Records the product queries belong in
[`@owlmeans/postgres-resource`](../postgres-resource) or
[`@owlmeans/mongo-resource`](../mongo-resource). Job queues are
[`@owlmeans/queue`](../queue) with [`@owlmeans/redis-queue`](../redis-queue).

## Installation

```bash
bun add @owlmeans/redis-resource@^0.1.18-rc.31
```

`ioredis` and `ajv` are peer dependencies. The connection service comes from
[`@owlmeans/redis`](../redis) (`appendRedis`).

## Concepts

- **Namespace**: each record is one JSON document under `<prefix>-<name>:<id>`. The prefix comes
  from the `cfg.dbs` entry's `schema`; the name is `resource.name` or the registration alias.
  `resource.key(id)` builds a key, and `key()` gives the namespace glob.
- **By-id vs walk**: `load(id)`, `get(id)`, `delete(id)` and `take(id)` are single-key commands.
  `load(where)`, `list`, `count` and `purge` `SCAN` the namespace and evaluate criteria in memory.
- **TTL**: a per-call write option. A number is seconds from now and a `Date` is an absolute
  instant. It is not a property of the resource, and every rewrite must pass it again.
- **Channel** (`publish`/`subscribe`): namespaced pub/sub between processes. **Watch** follows
  one key through keyspace notifications.
- **Stream** (`stream`/`consume`): an append-only Redis Stream, trimmed to `STREAM_MAX_LENGTH`,
  read by tailing or through a consumer group.
- **Unpaged**: `list(where)` returns every match. A `page` requires a `size`.

## Usage

### Register and type once

```ts
import { makeRedisResource } from '@owlmeans/redis-resource'
import type { RedisResource } from '@owlmeans/redis-resource'
import { AUTH_CACHE } from '@owlmeans/server-auth'

// in the server context factory, after appendRedis(context)
context.registerResource(makeRedisResource(AUTH_CACHE))
context.registerResource(makeRedisResource<ResetToken>(RES_RESET_TOKEN))
context.registerResource(makeRedisResource<ProjectEvent>(PROJECT_EVENT_PUBSUB))

// type the RESOURCE where it is taken out of the context, never per method call
const tokens = context.resource<RedisResource<ResetToken>>(RES_RESET_TOKEN)
```

### Expiring, single-use records

```ts
const created = await tokens.create({ userId, email }, { ttl: 15 * 60 })  // id generated, SET NX
const byEmail = await tokens.load({ email })                              // walks the namespace

try {
  const token = await tokens.take(tokenId)                                // GETDEL: one caller only
  await resetPassword(token.userId, password)
} catch (error) {
  if (error instanceof UnknownRecordError) {
    throw new LinkExpired()                                               // already used or expired
  }
  throw error
}

// a renewal rewrites the key, so it must carry the TTL again
await sessions.update({ ...session, seenAt: Date.now() }, { ttl: 3600 })
```

`UnknownRecordError` comes from `@owlmeans/resource`; `LinkExpired` stands for an app error.

### Pub/sub between processes

```ts
const events = context.resource<RedisResource<ProjectEvent>>(PROJECT_EVENT_PUBSUB)

// producer: one channel per organization entity
await events.publish({ type: 'updated', projectId }, entityId)

// consumer (a socket handler, another service)
const unsubscribe = await events.subscribe(
  event => socket.send(JSON.stringify(event)),
  { channel: entityId }
)
socket.on('close', () => { void unsubscribe() })
```

A shared bus is just a fixed channel name (`publish(event, 'bus')`,
`subscribe(handler, { channel: 'bus' })`). Omitting the channel on `subscribe` listens to the
resource's whole namespace.

### Watch one record

```ts
const unwatch = await cache.watch(id, record => {
  // the current value on every write; `null` once the key is gone (deleted or expired)
  render(record)
}, { once: true })
```

### Streams with a consumer group

```ts
const thinking = context.resource<RedisResource<ThinkingEvent>>(THINKING_STREAM)

await thinking.stream(`run:${runId}`, { step: 'reasoning', content: text })

for await (const event of thinking.consume(`run:${runId}`, { group: 'renderers', consumer: podName })) {
  await deliver(event)
}
```

Without `group`, `consume` tails from now with `XREAD`. With one, it joins the group and reclaims
stale entries under the consumer name you pass.

## Reads

`load(id)` / `get(id)` / `delete(id)` / `take(id)` are O(1) commands on one key. `load({ ... })`,
`get({ ... })`, `list`, `count` and `purge` walk this resource's **own namespace** with `SCAN`
(never `KEYS`, which blocks the server for the whole sweep), read the values with `MGET`, and
evaluate the criteria in memory with the engine from `@owlmeans/resource`. That is O(N) over the
namespace: right for a small namespaced set, such as a session cache or an adapter store, and wrong
for anything unbounded or on a hot path. `load({ id })` is recognised and answered by key.

Redis is **unpaged**: `list(where)` with no `size` returns every match, and `list(where, { page })`
without a `size` throws `UnsupportedArgumentError('page-without-size')`. `ListResult.total` always
counts every match.

The namespace walk reaches one server, so `list` / `count` / `purge` are not cluster-safe. In a
clustered deployment, use the by-id operations only.

## TTL

| `opts.ttl` | Meaning | Command |
|---|---|---|
| `number` | seconds from now | `EXPIRE` |
| `Date` | the absolute instant to expire at | `PEXPIREAT` (milliseconds, which is what `Date.getTime()` gives) |
| omitted | persistent (`PTTL` reports `-1`) | none |

A `Date` already in the past drops the record immediately. `update` and `save` rewrite the key, so
a renewal has to pass its TTL again. Otherwise the record becomes persistent.

## API

### `makeRedisResource<R, T>(alias, dbAlias?, serviceAlias?): T`

Creates a Redis resource (`T` defaults to `RedisResource<R>`). Both alias arguments default to
`DEFAULT_DB_ALIAS` (`'redis'`).

### `RedisResource<T>`

`Resource<T>` plus:
- `publish(value, channel?): Promise<void>`, which publishes to a namespaced pub/sub channel
- `subscribe(handler, { channel?, once?, ttl? }): Promise<Unsubscribe>`, channel pub/sub
- `watch(id, handler, { once?, ttl? }): Promise<Unsubscribe>`, keyspace notifications for ONE
  record. The handler is given `null` once the key is gone. It is bound to **db 0**, so deployments
  sharing an instance isolate on the key prefix, and the server needs `notify-keyspace-events`
- `stream(key, value): Promise<void>`, which appends to a Redis Stream
- `consume(key, { group?, consumer?, block? }): AsyncGenerator<T>`, which consumes from a Redis Stream
- `key(key?): string`, the namespaced key, or the namespace's glob
- `db: RedisDb`, `name?: string`

`create` generates an id when none is given and refuses an existing one (`RecordExists`, via
`SET NX`). `update` replaces the whole record and throws `UnknownRecordError` for an unknown id.
`save` is the upsert. `delete` returns the removed record or `null`; `take` throws when the key is
gone. `purge` refuses an empty criteria object.

### Exports

| Symbol | Kind | Purpose |
|---|---|---|
| `makeRedisResource` | function | The resource factory |
| `RedisResource<T>` | type | `Resource<T>` + `PubSubResource`, `WatchableResource`, `StreamResource`, `db`, `name`, `key` |
| `RedisDbService` | type | Connection service contract implemented by `@owlmeans/redis`, including `options(alias?)` |
| `RedisConnection` | type | Single-node or cluster connection settings plus the key prefix |
| `RedisDb`, `RedisClient` | type | `{ client, prefix }` and `Redis \| Cluster` |
| `DEFAULT_DB_ALIAS` | const | `'redis'` |
| `DEFAULT_PAGE_SIZE` | const | `0`, meaning unpaged |
| `SCAN_BATCH`, `READ_BATCH` | const | Keys per `SCAN` and per `MGET`/`DEL` round trip (200) |
| `STREAM_MAX_LENGTH` | const | Approximate stream trim length (10 000) |
| `DEFAULT_STREAM_BLOCK` | const | Stream read block time in ms (1 000) |
| `RECLAIM_IDLE`, `RECLAIM_COUNT` | const | When (60 000 ms idle) and how many (10) pending entries a consumer reclaims |
| `CONSUMER_ID_LENGTH` | const | Length of a generated consumer name (15) |

## Requirements

Redis 6.2 or newer: `delete` and `take` use `GETDEL`.

## Common pitfalls

- **Using it as a source of truth.** If losing the record changes behaviour, it belongs in the
  database.
- **Criteria reads on a large or unbounded namespace.** `load(where)`, `list`, `count` and `purge`
  are O(N) walks, unpaged and not cluster-safe.
- **Renewing without a TTL.** `update`/`save` rewrite the key and the record becomes permanent.
- **Expecting `update` to merge.** It replaces the whole record.
- **Setting `resource.name` by accident.** Two resources with the same name share one id space.
- **`watch` on a connection with `meta.dbIndex` other than 0**, or on a server without
  `notify-keyspace-events`. The handler silently never fires.
- **Claiming stream entries under a fixed consumer name.** Pass the real consumer name to
  `consume`, or entries end up owned by a consumer that never reads.
- **Asserting an expiry by trusting the command.** Read `PTTL` back; a TTL set in the wrong unit is
  still an expiry, just millennia out.
- **Simulating a queue with lists or streams.** Retried, restart-safe work is
  `@owlmeans/queue`.

## Related packages

- [`@owlmeans/redis`](../redis): the Redis connection service and the `cfg.dbs` entry the prefix comes from
- [`@owlmeans/resource`](../resource): `Resource<T>`, the criteria engine, the capability interfaces
- [`@owlmeans/redis-queue`](../redis-queue): BullMQ queues on the same connections
- [`@owlmeans/server-socket`](../server-socket): socket handlers that relay pub/sub and stream events
- [`@owlmeans/postgres-resource`](../postgres-resource): where durable records live

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.32
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
