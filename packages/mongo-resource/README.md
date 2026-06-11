# @owlmeans/mongo-resource

MongoDB-backed `Resource<T>` implementation — the primary database resource for OwlMeans server apps.

## Overview

- `makeMongoResource<R, T>(alias, dbAlias?, serviceAlias?, maker?)` — factory for MongoDB resources
- `MongoResource<T>` — extends `Resource<T>` with MongoDB collection, indexing, and field encryption
- Supports CRUD, list/pagination, AJV schema validation, and field-level locking (encryption)
- Used for all persistent data models in server applications

## Installation

```bash
bun add @owlmeans/mongo-resource
```

## Usage

Define a resource:

```typescript
import { makeMongoResource } from '@owlmeans/mongo-resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { ResourceMaker } from '@owlmeans/resource'

export interface ProjectResource extends MongoResource<ProjectRecord> {}

export const makeProjectResource: ResourceMaker<ProjectRecord, ProjectResource> = (dbAlias, serviceAlias) => {
  const resource = makeMongoResource<ProjectRecord>(
    RES_PROJECT, dbAlias, serviceAlias, makeProjectResource
  )
  resource.schema = ProjectSchema
  resource.index('entity', { entityId: 1 })
  resource.index('alias', { alias: 1 })
  return resource
}
```

Register in context:

```typescript
context.registerResource(makeProjectResource())
```

Use in a handler:

```typescript
const projects = context.resource<ProjectResource>(RES_PROJECT)
const record = await projects.create({ entityId, alias, title })
const list = await projects.list({ criteria: { entityId } })
```

## API

### `makeMongoResource<R, T>(alias, dbAlias?, serviceAlias?, maker?): T`

Creates a MongoDB resource. `dbAlias` defaults to `DEFAULT_DB_ALIAS` (`'mongo'`).

### `MongoResource<T>`

Extends `Resource<T>` with:
- `collection: Collection` — MongoDB collection
- `db(): Promise<Db>` — get the MongoDB database
- `index(name, spec, options?): this` — define a collection index
- `lock(record, fields?)` / `unlock(record, fields?)` — encrypt/decrypt secure fields
- `getDefaults(): Partial<T>` — default values derived from schema

### `Resource<T>` methods (all implemented)

`get`, `load`, `create`, `update`, `save`, `delete`, `pick`, `list`

### Constants

- `DEFAULT_DB_ALIAS` — `'mongo'`
- `DEFAULT_PAGE_SIZE` — `10`

## Related Packages

- [`@owlmeans/resource`](../resource) — `Resource<T>`, `ResourceRecord`, `ResourceMaker` base
- [`@owlmeans/mongo`](../mongo) — MongoDB connection service required by this package

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded Claude Code skills and GitHub Copilot instructions under
`agent-meta/`. After installing your `@owlmeans/*` packages, run the OwlMeans
agent-skills installer to place them into your project's native locations
(`.claude/skills/` and `.github/instructions/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
