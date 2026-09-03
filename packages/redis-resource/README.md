# @owlmeans/redis-resource

Redis-backed resource with pub/sub, keyspace watching and streams for real-time features.

## Overview

- `makeRedisResource(alias, dbAlias?, serviceAlias?)` — creates a Redis resource
- `RedisResource<T>` — `Resource<T>` composed with `PubSubResource`, `WatchableResource` and
  `StreamResource`
- One JSON document per namespaced key: `resource.key(id)` → `<schema>-<alias>:<id>`
- Used for authentication caches, pub/sub channels, and async event streams

## Installation

```bash
bun add @owlmeans/redis-resource@^0.1.18-rc.11
```

## Usage

Register Redis resources in context setup:

```typescript
import { makeRedisResource } from '@owlmeans/redis-resource'
import { AUTH_CACHE } from '@owlmeans/server-auth'

context.registerResource(makeRedisResource(AUTH_CACHE))
context.registerResource(makeRedisResource(AGENT_THINKING_STREAM))
context.registerResource(makeRedisResource(AGENT_WATCHER_PUBSUB))
```

Type the resource once, at the point it is taken out of the context:

```typescript
import type { RedisResource } from '@owlmeans/redis-resource'

const cache = context.resource<RedisResource<SessionData>>(AUTH_CACHE)

await cache.create({ id, token }, { ttl: 3600 })   // seconds, or a Date
const session = await cache.load({ token })        // criteria, not just an id
await cache.take(id)                               // delete-and-return
```

Publish and subscribe:

```typescript
const pubsub = context.resource<RedisResource<AgentWatcherEvent>>(AGENT_WATCHER_PUBSUB)

await pubsub.publish({ type: 'update', payload: data }, channel)

const unsubscribe = await pubsub.subscribe(
  event => handleEvent(event), { channel, once: true }
)
```

Watch one record for changes (keyspace notifications):

```typescript
const unwatch = await cache.watch(id, record => {
  // `null` once the key is gone — deleted or expired
  render(record)
}, { once: true })
```

Stream events (Redis Streams):

```typescript
const stream = context.resource<RedisResource<AgentThinkingEvent>>(AGENT_THINKING_STREAM)

await stream.stream('thinking-key', { step: 'reasoning', content: text })

for await (const event of stream.consume('thinking-key', { group: 'workers', consumer: 'worker-1' })) {
  process(event)
}
```

## Reads

`load(id)` / `get(id)` / `delete(id)` / `take(id)` are O(1) commands on one key. `load({ ... })`,
`get({ ... })`, `list`, `count` and `purge` walk this resource's **own namespace** with `SCAN`
(never `KEYS`, which blocks the server for the whole sweep), read the values with `MGET`, and
evaluate the criteria in memory. That is O(N) over the namespace: right for a small namespaced set
— a session cache, an adapter store — and wrong for anything unbounded or on a hot path. A
resource that needs real queries belongs in `@owlmeans/mongo-resource` or
`@owlmeans/postgres-resource`.

Redis is **unpaged**: `list(where)` with no `size` returns every match, and `list(where, { page })`
without a `size` throws `UnsupportedArgumentError('page-without-size')`. `ListResult.total` always
counts every match.

The namespace walk reaches one server, so `list` / `count` / `purge` are not cluster-safe — in a
clustered deployment use the by-id operations only.

## TTL

| `opts.ttl` | Meaning | Command |
|---|---|---|
| `number` | seconds from now | `EXPIRE` |
| `Date` | the absolute instant to expire at | `PEXPIREAT` (milliseconds — what `Date.getTime()` gives) |
| omitted | persistent (`PTTL` reports `-1`) | — |

A `Date` already in the past drops the record immediately. `update` and `save` rewrite the key, so
a renewal has to pass its TTL again — otherwise the record becomes persistent.

## API

### `makeRedisResource<R>(alias, dbAlias?, serviceAlias?): RedisResource<R>`

Creates a Redis resource. Both alias arguments default to `DEFAULT_DB_ALIAS` (`'redis'`).

### `RedisResource<T>`

`Resource<T>` plus:
- `publish(value, channel?): Promise<void>` — publish to a namespaced pub/sub channel
- `subscribe(handler, { channel?, once?, ttl? }): Promise<Unsubscribe>` — channel pub/sub
- `watch(id, handler, { once?, ttl? }): Promise<Unsubscribe>` — keyspace notifications for ONE
  record; the handler is given `null` once the key is gone. Bound to **db 0**, so deployments
  sharing an instance isolate on the key prefix, and the server needs `notify-keyspace-events`
- `stream(key, value): Promise<void>` — append to a Redis Stream
- `consume(key, { group?, consumer?, block? }): AsyncGenerator<T>` — consume from a Redis Stream
- `key(key?): string` — the namespaced key, or the namespace's glob

### Constants

- `DEFAULT_DB_ALIAS` — `'redis'`
- `DEFAULT_PAGE_SIZE` — `0`, meaning unpaged

## Requirements

Redis 6.2 or newer: `delete` and `take` use `GETDEL`.

## Related Packages

- [`@owlmeans/redis`](../redis) — Redis connection service
- [`@owlmeans/resource`](../resource) — `Resource<T>` base interface and the criteria engine
- [`@owlmeans/server-socket`](../server-socket) — WebSocket handlers often use Redis resources for streaming

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.12
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
