# @owlmeans/mongo

MongoDB service for OwlMeans server contexts — connection management with replica set and cluster support.

## Overview

- `makeMongoDbService(alias?)` — creates a MongoDB connection service
- `appendMongo(context, alias?)` — registers the service in the context
- Reads connection config from `context.cfg.dbs[alias]` (supports `kluster:` directives)
- Used as the database provider for `@owlmeans/mongo-resource`

## Installation

```bash
bun add @owlmeans/mongo
```

## Usage

```typescript
import { appendMongo, DEFAULT_ALIAS as MONGO_SERVICE } from '@owlmeans/mongo'

// In context setup (backend/src/context.ts)
appendMongo<C, T>(context)
```

Config (`config.json`):

```json
{
  "dbs": {
    "mongo": {
      "url": "mongodb://localhost:27017",
      "dbName": "myapp"
    }
  }
}
```

## API

### `makeMongoDbService(alias?): MongoDbService`

Creates the MongoDB service. `alias` defaults to `DEFAULT_ALIAS` (`'mongo'`).

### `appendMongo<C, T>(context, alias?): T`

Registers the MongoDB service in the context.

### Constants

- `DEFAULT_ALIAS` — `'mongo'`
- `DEF_REPLSET` — `'rs-main'` — default replica set name

## Related Packages

- [`@owlmeans/mongo-resource`](../mongo-resource) — `makeMongoResource` uses this service
- [`@owlmeans/server-app`](../server-app) — `makeContext` in conjunction with `appendMongo`
- [`@owlmeans/kluster`](../kluster) — `kluster:` directives resolve Mongo URLs in Kubernetes

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
