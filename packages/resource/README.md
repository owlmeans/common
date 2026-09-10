# @owlmeans/resource

Abstract CRUD interface and types for all data persistence in OwlMeans applications.

## Overview

- `Resource<T>` interface: `get`, `load`, `list`, `count`, `create`, `update`, `save`, `delete`,
  `take`, `purge`
- `ResourceRecord` base type (`{ id?: string }`) that all stored records extend
- `ResourceMaker<R, T>` factory signature used by `makeMongoResource`, `createStateResource`, etc.
- `Criteria<T>` and `Sort<T>` — one query language every backend speaks — plus `ListOptions<T>`,
  `ListQuery<T>` and `ListResult<T>`
- Optional capabilities a backend composes in: `PubSubResource`, `WatchableResource`,
  `StreamResource`, `LockableResource`, `MigratableResource`
- Error classes: `ResourceError`, `UnknownRecordError`, `RecordExists`

## Installation

```bash
bun add @owlmeans/resource@^0.1.18-rc.8
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
  return makeMongoResource<ProjectRecord>('project', dbAlias, serviceAlias, 'projects')
}
```

Use resource methods in a handler:

```typescript
import { UnknownRecordError } from '@owlmeans/resource'
import type { ListResult } from '@owlmeans/resource'

// Get or throw — by id, or by whatever set of fields identifies the record
const project = await ctx.project().get(projectId)
const byName = await ctx.project().get({ entityId, alias: 'main' })

// Load (returns null if not found)
const story = await ctx.story().load(storyId)

// List with criteria, sorting and paging
const result: ListResult<ProjectRecord> = await ctx.project().list(
  { entityId, alias: ['main', 'staging'] },
  { sort: [{ field: 'createdAt', order: 'desc' }], page: 0, size: 20 }
)
```

## API

### `Resource<T>` methods

Every read takes either an id or a criteria object, so fetching one record by several fields is a
single call rather than a list whose first element is taken.

- `get(id)` / `get(where, { sort })` — fetch one; throws `UnknownRecordError` if missing
- `load(id)` / `load(where, { sort })` — fetch one; returns `null` if missing
- `list(where?, { sort, page, size })` — returns `ListResult<T>`
- `count(where?)` — how many records the criteria match
- `create(record, { ttl })` — insert; throws `RecordExists` if already exists
- `update(record, { ttl })` — replaces the whole record; throws `UnknownRecordError` if missing
- `save(record, { ttl })` — creates when the record carries no id, replaces otherwise
- `delete(id)` — remove; returns the deleted record or `null`
- `take(id)` — **delete and return** the record; throws `UnknownRecordError` if missing. Never use it
  for read-only checks
- `purge(where)` — bulk delete; refuses an empty criteria object rather than emptying the resource

`ttl` is seconds from now or the instant to expire at; backends without expiry refuse it.

### `Criteria<T>`

Keys are the record's own fields, so a typo is a compile error; a dotted key reaches into a nested
value or a jsonb column and stays open.

- A bare value is equality, a bare **array** is "any of these", `null` asks for the absence of a
  value, and `undefined` is **skipped** — an untouched filter must never empty a list
- Operators: `$eq` `$ne` `$gt` `$gte` `$lt` `$lte` `$in` `$nin` `$exists` `$null` `$like` `$ilike`
  `$regex` `$startsWith` `$endsWith` `$between` `$contains` `$contained` `$overlaps`
- Composition: `$and`, `$or`, `$not`

```typescript
await ctx.project().list({
  status: ['active', 'paused'],
  archivedAt: null,
  'meta.tier': { $in: ['gold', 'silver'] },
  $or: [{ ownerId }, { shared: true }]
})
```

### `Sort<T>`

A bare field name sorts ascending; `{ field, order: 'asc' | 'desc' }` states it explicitly. `sort`
takes a list, applied left to right.

### `ListResult<T>` and paging

`list()` answers `{ items, total, page?, size? }`.

Paging is opt-in per call and each backend decides what an unasked-for page means. Mongo and
Postgres cap an unbounded read at **100** records when no `size` is given; Redis and the in-memory
stores (state, static, client and config resources) return everything. `size: 0` means **no limit**
everywhere. Asking for a `page` without a `size` on an unpaged backend throws
`UnsupportedArgumentError('page-without-size')`.

### `ResourceMaker<R, T>`

```typescript
interface ResourceMaker<R extends ResourceRecord, T extends Resource<R> = Resource<R>> {
  (dbAlias?: string, serviceAlias?: string): T
}
```

### Optional capabilities

A backend composes in only what it can honour; the base `Resource<T>` contract stays small.

- `PubSubResource<T>` — `publish(value, channel?)`, `subscribe(handler, { channel?, once?, ttl? })`
- `WatchableResource<T>` — `watch(id, handler, opts?)`, following ONE record
- `StreamResource<T>` — `stream(key, value)` and `consume(key, { group?, consumer?, block? })`
- `LockableResource<T>` — `lock(record, fields?)` / `unlock(record, fields?)` for field level
  encryption at rest
- `MigratableResource<Tx, Self>` — see below

### In-memory query engine

The same criteria and sorting, evaluated over plain arrays. Every in-memory store uses these, and so
can application code that has already loaded its records:

- `matchCriteria(record, where)` — does one record satisfy the criteria
- `filterRecords(records, where)` / `sortRecords(records, sort)`
- `firstMatch(records, where, opts?)` — the `load(where)` semantics
- `applyQuery(records, query)` — filter, sort and page in one step, answering a `ListResult`

### Database naming

`dbName()` answers `config.schema ?? config.alias ?? service.alias` — the database (or schema) a
resource reads and writes.

### Migration framework

Storage-agnostic and optional — a backend that supports code migrations (mongo, postgres)
extends `MigratableResource<Tx, Self>`; backends with nothing to migrate simply don't (the same way
pub/sub is an optional capability of redis resources). Migrations run **automatically during
resource initialization** (app setup) — registering one is all an app ever does.

- `MigratableResource<Tx, Self>` — `migration(name, apply, stage?): Self` + `migrations()`
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

- `filterObject(obj, keep?)` — strip null/undefined fields from a record before saving
- `createListSchema(schema)` — the AJV schema for a `ListResult` of the given record schema
- `createDbService(alias, override, init?)` — base plumbing for `ResourceDbService` implementations

### Error Classes

- `ResourceError` — base resource error
- `UnknownRecordError` — record not found (has `.id` getter)
- `RecordExists` — duplicate record on `create`
- `RecordUpdateFailed` — a write reached the backend but changed nothing
- `MisshapedRecord` — invalid record structure
- `UnsupportedArgumentError` — an argument this backend cannot honour, e.g. `page-without-size`
- `UnsupportedMethodError` — a method this backend does not implement
- `MigrationError` — a migration body threw; initialization aborts
- `MigrationConflict` — an already applied migration's body changed, or a name was redeclared with a different body

## Related Packages

- [`@owlmeans/mongo-resource`](../mongo-resource) — MongoDB implementation
- [`@owlmeans/postgres-resource`](../postgres-resource) — PostgreSQL implementation
- [`@owlmeans/redis-resource`](../redis-resource) — Redis implementation
- [`@owlmeans/static-resource`](../static-resource) — in-memory implementation over config records
- [`@owlmeans/state`](../state) — the client store, with live subscriptions

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
