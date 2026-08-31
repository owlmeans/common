# @owlmeans/resource

Abstract CRUD interface and types for all data persistence in OwlMeans applications.

## Overview

- `Resource<T>` interface: `get`, `load`, `list`, `save`, `create`, `update`, `delete`, `pick`
- `ResourceRecord` base type (`{ id?: string }`) that all stored records extend
- `ResourceMaker<R, T>` factory signature used by `makeMongoResource`, `createStateResource`, etc.
- `ListResult<T>`, `ListOptions`, `ListPager` for paginated queries
- Error classes: `ResourceError`, `UnknownRecordError`, `RecordExists`

## Installation

```bash
bun add @owlmeans/resource
```

## Usage

Define a resource maker following the standard factory pattern:

```typescript
import type { ResourceMaker, ResourceRecord } from '@owlmeans/resource'
import { makeMongoResource } from '@owlmeans/mongo-resource'

interface ProjectRecord extends ResourceRecord {
  entityId: string
  alias: string
  createdAt: Date
}

export const makeProjectResource: ResourceMaker<ProjectRecord> = (dbAlias, serviceAlias) => {
  return makeMongoResource<ProjectRecord>('project', dbAlias, serviceAlias, makeProjectResource)
}
```

Use resource methods in a handler:

```typescript
import { UnknownRecordError } from '@owlmeans/resource'
import type { ListResult } from '@owlmeans/resource'

// Get or throw
const project = await ctx.project().get(projectId)

// Load (returns null if not found)
const story = await ctx.story().load(storyId)

// List with criteria and pagination
const result: ListResult<ProjectRecord> = await ctx.project().list({
  criteria: { entityId: req.auth!.entityId },
  pager: { page: 0, size: 20 }
})
```

## API

### `Resource<T>` methods

- `get(id, field?, opts?)` — fetch by ID; throws `UnknownRecordError` if missing
- `load(id, field?, opts?)` — fetch by ID; returns `null` if missing
- `list(criteria?, opts?)` — paginated list; returns `ListResult<T>`
- `create(record, opts?)` — insert; throws `RecordExists` if already exists
- `save(record, opts?)` — upsert by ID
- `update(record, opts?)` — update; throws `UnknownRecordError` if missing
- `delete(id, opts?)` — remove; returns the deleted record or `null`
- `pick(id, opts?)` — **delete and return** the record; throws `UnknownRecordError` if missing. Never use it for read-only checks

### `ResourceMaker<R, T>`

```typescript
interface ResourceMaker<R extends ResourceRecord, T extends Resource<R> = Resource<R>> {
  (dbAlias?: string, serviceAlias?: string): T
}
```

### Migration framework

Storage-agnostic and optional — a backend that supports code migrations (mongo, postgres)
extends `MigratableResource<Tx>`; backends with nothing to migrate simply don't (the same way
pub/sub is an optional capability of redis resources). Migrations run **automatically during
resource initialization** (app setup) — registering one is all an app ever does.

- `MigratableResource<Tx>` — `migration(name, apply, stage?): this` + `migrations()`
- `createMigrationRegistry<Tx>()` — per-alias ledger of registered migrations; declaration
  order is application order; identical re-registration is a no-op, a changed body under a
  used name throws `MigrationConflict`
- `MigrationStore<Tx>` — the *migration register* a database implements to track applied
  migrations (`ensure` / `applied` / `baseline` / `run`); both mongo and postgres persist it
  as `_owlmeans_migrations`
- `runMigrations(alias, registry, store, opts?)` — the storage-agnostic runner; with
  `baseline: true` migrations are recorded instead of run (used on just-created structures);
  `strictChecksum` (default) rejects edited applied bodies
- `MigrationStage.Pre` / `MigrationStage.Post` — run before / after the backend's structure
  reconciliation

### Helpers

- `prepareListOptions(defPageSize, criteria?, opts?)` — normalize list criteria + pager
- `filterObject(obj, keep?)` — strip null/undefined fields from a record before saving
- `createDbService(alias, override, init?)` — base plumbing for `ResourceDbService` implementations

### Error Classes

- `ResourceError` — base resource error
- `UnknownRecordError` — record not found (has `.id` getter)
- `RecordExists` — duplicate record on `create`
- `MisshapedRecord` — invalid record structure
- `MigrationError` — a migration body threw; initialization aborts
- `MigrationConflict` — an already applied migration's body changed, or a name was redeclared with a different body

## Related Packages

- [`@owlmeans/mongo-resource`](../mongo-resource) — MongoDB implementation
- [`@owlmeans/redis-resource`](../redis-resource) — Redis implementation
- [`@owlmeans/state`](../state) — in-memory implementation for client state

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
