# @owlmeans/redis

Redis service for OwlMeans server contexts — connection management with cluster support.

## Overview

- `makeRedisService(alias?)` — creates a Redis connection service
- `appendRedis(context, alias?)` — registers the service in the context
- Reads connection config from `context.cfg.dbs[alias]`
- Used as the connection provider for `@owlmeans/redis-resource`

## Installation

```bash
bun add @owlmeans/redis
```

## Usage

```typescript
import { appendRedis, DEFAULT_ALIAS } from '@owlmeans/redis'

// In context setup (backend/src/context.ts)
appendRedis<C, T>(context)
```

Config (`config.json`):

```json
{
  "dbs": {
    "redis": {
      "host": "localhost",
      "port": 6379
    }
  }
}
```

## API

### `makeRedisService(alias?): RedisDbService`

Creates the Redis service. `alias` defaults to `DEFAULT_ALIAS` (`'redis'`).

### `appendRedis<C, T>(context, alias?): T`

Registers the Redis service in the context.

### `RedisMeta`

Extends `RedisOptions` (ioredis) — all ioredis connection options are supported in config.

## Related Packages

- [`@owlmeans/redis-resource`](../redis-resource) — pub/sub and streaming resources over this service
- [`@owlmeans/server-auth`](../server-auth) — `AUTH_CACHE` redis resource for auth token caching

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
