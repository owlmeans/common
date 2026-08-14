# @owlmeans/redis-resource

Redis-backed resource with pub/sub and streaming support for real-time features.

## Overview

- `makeRedisResource(alias, dbAlias?)` — creates a Redis resource
- `RedisResource<T>` — extends `Resource<T>` with `subscribe`, `publish`, `stream`, and `consume`
- Used for authentication caches, pub/sub channels, and async event streams

## Installation

```bash
bun add @owlmeans/redis-resource
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

Define typed resource interfaces:

```typescript
import type { RedisResource } from '@owlmeans/redis-resource'

interface AgentThinkingStream extends RedisResource<AgentThinkingEvent> {}
interface AgentWatcherPubsub extends RedisResource<AgentWatcherEvent> {}
```

Publish and subscribe:

```typescript
const pubsub = context.resource<AgentWatcherPubsub>(AGENT_WATCHER_PUBSUB)

// Publisher side
await pubsub.publish({ type: 'update', payload: data })

// Subscriber side
const unsubscribe = await pubsub.subscribe(async (event) => {
  handleEvent(event)
})
```

Stream events (Redis Streams):

```typescript
const stream = context.resource<AgentThinkingStream>(AGENT_THINKING_STREAM)

// Producer
await stream.stream('thinking-key', { step: 'reasoning', content: text })

// Consumer (async generator)
for await (const event of stream.consume('thinking-key', 'workers', 'worker-1')) {
  process(event)
}
```

## API

### `makeRedisResource(alias, dbAlias?): RedisResource<T>`

Creates a Redis resource. `dbAlias` defaults to `DEFAULT_DB_ALIAS` (`'redis'`).

### `RedisResource<T>`

Extends `Resource<T>` with:
- `subscribe<T>(handler, key?): Promise<() => Promise<void>>` — subscribe to pub/sub channel
- `publish<T>(value, key?): Promise<void>` — publish to pub/sub channel
- `stream<T>(key, data): Promise<void>` — append to a Redis Stream
- `consume<T>(key, group?, consumer?): AsyncGenerator<T>` — consume from a Redis Stream

### Constants

- `DEFAULT_DB_ALIAS` — `'redis'`

## Related Packages

- [`@owlmeans/redis`](../redis) — Redis connection service
- [`@owlmeans/resource`](../resource) — `Resource<T>` base interface
- [`@owlmeans/server-socket`](../server-socket) — WebSocket handlers often use Redis resources for streaming

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
