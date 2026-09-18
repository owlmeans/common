# @owlmeans/resource

The storage-agnostic CRUD contract every OwlMeans data store implements: `Resource<T>`, the typed
criteria/sort/paging vocabulary, optional capabilities (pub/sub, watch, streams, field encryption),
the shared resource errors and the code-migration framework. An app imports it to **type** its
records, resource makers and queries, to throw and catch `UnknownRecordError` / `RecordExists`, and
to filter lists it already holds in memory. It does not store anything itself — pick a backend
(`@owlmeans/mongo-resource`, `@owlmeans/postgres-resource`, `@owlmeans/redis-resource`,
`@owlmeans/static-resource`, or `@owlmeans/state` on the client) for that; which one a feature
wants is the `resource-choice` decision.

## Installation

```bash
bun add @owlmeans/resource@^0.1.18-rc.27
```

## Concepts

- **Record** — any object extending `ResourceRecord` (`{ id?: string }`); `id` is the only field the
  contract knows about.
- **Resource** — `Resource<T>`, typed CRUD over records, registered on a context under an alias and
  read back with `ctx.resource<T>(alias)`. Every method returns records, never driver results.
- **Resource maker** — a `ResourceMaker<R, T>` factory `(dbAlias?, serviceAlias?) => T` that builds a
  concrete resource from a backend and declares its schema, indexes and migrations.
- **Criteria** — `Criteria<T>`, one query language keyed by the record's own fields that every
  backend (SQL, Mongo, Redis, in-memory) answers the same way.
- **Capability** — an optional interface (`PubSubResource`, `WatchableResource`, `StreamResource`,
  `LockableResource`, `MigratableResource`) a backend composes in beside `Resource<T>` only when it
  can honour it.
- **Migration** — a named, checksummed body registered on a `MigratableResource`, applied once per
  database during resource initialization, `Pre` or `Post` structure reconciliation.

## Usage

### Declare a record type and a resource maker

The maker is typed with `ResourceMaker`, so an app registers `makeXResource()` without repeating the
argument list. Schema, indexes and migrations are backend-specific calls on the resource it returns.

```ts
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { makeMongoResource } from '@owlmeans/mongo-resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { ResourceMaker, ResourceRecord } from '@owlmeans/resource'

export const RES_PROJECT = 'project'

export interface ProjectRecord extends ResourceRecord {
  entityId: string
  alias: string
  status: 'active' | 'paused' | 'archived'
  tags: string[]
  createdAt: Date
}

export interface ProjectResource extends MongoResource<ProjectRecord> {}

export const makeProjectResource: ResourceMaker<ProjectRecord, ProjectResource> = (dbAlias, serviceAlias) => {
  const resource = makeMongoResource<ProjectRecord, ProjectResource>(RES_PROJECT, dbAlias, serviceAlias)
  resource.index('entityAlias', { entityId: 1, alias: 1 }, { unique: true })
  resource.index('createdAt', { createdAt: -1 })

  return resource
}

// In the server context factory
context.registerResource(makeProjectResource())

// Anywhere with the context
export const projectResource = (ctx: BasicContext<BasicConfig>) =>
  ctx.resource<ProjectResource>(RES_PROJECT)
```

### CRUD in a handler

A read is addressed by an id **or** by criteria; a write takes the record, with its id inside it.
The organization is keyed by `entityId`, which a server handler takes from `requireEntityKey(req)`
(`@owlmeans/auth-common`), never from the token or the body.

```ts
import { requireEntityKey } from '@owlmeans/auth-common'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import { MisshapedRecord, UnknownRecordError } from '@owlmeans/resource'
import type { Resource } from '@owlmeans/resource'

export const handleCreateProject = async (req: AbstractRequest, ctx: Context) => {
  const entityId = requireEntityKey(req)
  const { alias } = req.body as { alias?: string }
  if (alias == null || alias.trim() === '') {
    throw new MisshapedRecord('alias-required')
  }

  // create() throws RecordExists on a duplicate; let it reach the client as a typed error
  return await projectResource(ctx).create({ entityId, alias, status: 'active', tags: [], createdAt: new Date() })
}

export const handleGetProject = async (req: AbstractRequest, ctx: Context) => {
  const entityId = requireEntityKey(req)
  const { alias } = req.params as { alias: string }

  // One record by several fields is one call — get() throws UnknownRecordError on a miss
  return await projectResource(ctx).get({ entityId, alias })
}

export const handleRenameProject = async (req: AbstractRequest, ctx: Context) => {
  const entityId = requireEntityKey(req)
  const { id } = req.params as { id: string }
  const project = await projectResource(ctx).load(id)
  if (project == null || project.entityId !== entityId) {
    throw new UnknownRecordError(id)
  }

  // update() replaces the whole record — spread the loaded one
  return await projectResource(ctx).update({ ...project, alias: (req.body as { alias: string }).alias })
}

export const handleDestroyProject = async (req: AbstractRequest, ctx: Context) => {
  const { id } = req.params as { id: string }
  // Dependants first: purge() refuses an empty criteria object
  await ctx.resource<Resource<StoryRecord>>('story').purge({ projectId: id })
  const deleted = await projectResource(ctx).delete(id)

  return { id, deleted: deleted != null }
}
```

### Criteria, sorting and paging

```ts
import type { Criteria, ListQuery, ListResult } from '@owlmeans/resource'

export const handleListProjects = async (req: AbstractRequest, ctx: Context) => {
  const entityId = requireEntityKey(req)
  const { where, sort, page, size } = req.query as ListQuery<ProjectRecord>

  const criteria: Criteria<ProjectRecord> = {
    ...where,
    entityId,                                  // always scoped, whatever the client sent
    status: where?.status ?? ['active', 'paused'],
    'meta.tier': { $in: ['gold', 'silver'] },  // a dotted key reaches into a nested value
    $or: [{ alias: { $ilike: 'owl%' } }, { tags: { $overlaps: ['pinned'] } }]
  }

  const result: ListResult<ProjectRecord> = await projectResource(ctx).list(criteria, {
    sort: sort ?? [{ field: 'createdAt', order: 'desc' }],
    page: page ?? 0,
    size: size ?? 20
  })

  return result // { items, total, page, size } — total counts every match, not the window
}

// Counting without carrying the records back
const inProgress = await ctx.resource<Resource<StoryRecord>>('story').count({ projectId, status: { $ne: 'done' } })

// The newest match, chosen by sort
const latest = await projectResource(ctx).load({ entityId }, { sort: [{ field: 'createdAt', order: 'desc' }] })
```

A shared `ListResult` schema for an entrypoint response comes from `createListSchema`:

```ts
import { createListSchema } from '@owlmeans/resource'

export const ProjectListSchema = createListSchema(ProjectSchema) // JSONSchemaType<ListResult<ProjectRecord>>
```

### The same criteria in memory

The in-memory helpers evaluate a criteria object exactly as the backends do, so a filter written for
an endpoint selects the same records when a screen or a test applies it to records already in hand.
Client state hooks take the same `Criteria<T>`.

```ts
import { useStoreList } from '@owlmeans/client'
import { applyQuery, filterRecords, firstMatch, matchCriteria } from '@owlmeans/resource'
import type { Criteria } from '@owlmeans/resource'

const open: Criteria<StoryRecord> = { status: ['open', 'review'], archivedAt: null, assignee: undefined }

filterRecords(stories, open)                                        // every match, insertion order
firstMatch(stories, open, { sort: [{ field: 'updatedAt', order: 'desc' }] })
applyQuery(stories, open, { sort: ['title'], page: 1, size: 10 })   // a full ListResult
stories.some(story => matchCriteria(story, { priority: { $gte: 3 } }))

// Web state (hook from @owlmeans/client) — the query is the same vocabulary
export const useStoryList = (query: Criteria<StoryRecord> = {}) =>
  useStoreList<StoryRecord>({ query, resource: STORY_STATE })
```

### Migrations and custom errors

A migratable backend runs registered migrations automatically during resource initialization;
registering one inside the maker is all an app does. Domain errors extend `ResourceError` and are
registered so they survive a service boundary.

```ts
import { ResilientError } from '@owlmeans/error'
import { makePostgresResource } from '@owlmeans/postgres-resource'
import { MigrationStage, ResourceError } from '@owlmeans/resource'
import type { ResourceMaker } from '@owlmeans/resource'

export const makeStoryResource: ResourceMaker<StoryRecord, StoryResource> = (dbAlias, serviceAlias) => {
  const resource = makePostgresResource<StoryRecord, StoryResource>('story', dbAlias, serviceAlias)
  resource.schema = StorySchema

  // Pre: before the table is reshaped — the only place to rescue data a reconciliation would drop
  resource.migration('0001-rescue-legacy-code', async tx => {
    await tx.execute(`UPDATE {{}} SET code = legacy_code WHERE code IS NULL`)
  }, MigrationStage.Pre)

  // Post: after reconciliation, so the new columns exist
  resource.migration('0002-backfill-priority', async tx => {
    await tx.execute(`UPDATE {{}} SET priority = 0 WHERE priority IS NULL`)
  }, MigrationStage.Post)

  return resource
}

export class StoryResourceError extends ResourceError {
  public static override typeName = `MyAppStory${ResourceError.typeName}`

  constructor(message: string = 'error') {
    super(`my-app-story:${message}`)
    this.type = StoryResourceError.typeName
  }
}

ResilientError.registerErrorClass(StoryResourceError)
```

## API

### `Resource<T>` methods

Every read takes either an id or a criteria object, so fetching one record by several fields is a
single call rather than a list whose first element is taken.

| Method | Signature | Notes |
|---|---|---|
| `get` | `(id) → T` / `(where, { sort }?) → T` | throws `UnknownRecordError` on a miss |
| `load` | `(id) → T \| null` / `(where, { sort }?) → T \| null` | the miss-tolerant read |
| `list` | `(where?, { sort, page, size }?) → ListResult<T>` | `total` counts every match |
| `count` | `(where?) → number` | how many records the criteria match |
| `create` | `(record, { ttl }?) → T` | throws `RecordExists` |
| `update` | `(record, { ttl }?) → T` | replaces the whole record; throws `UnknownRecordError` |
| `save` | `(record, { ttl }?) → T` | creates when the record carries no id, replaces otherwise |
| `delete` | `(id) → T \| null` | returns what it removed |
| `take` | `(id) → T` | **deletes and returns** the record; throws `UnknownRecordError`. Never a read |
| `purge` | `(where) → number` | bulk delete; refuses an empty criteria object |

`ttl` is seconds from now or the instant to expire at; backends without expiry refuse it.

### `Criteria<T>`

Keys are the record's own fields, so a typo is a compile error; a dotted key reaches into a nested
value or a jsonb column and stays open.

| Written as | Means |
|---|---|
| `{ status: 'open' }` | equality |
| `{ status: ['open', 'done'] }` | any of these — exact array equality is `{ $eq: [...] }` |
| `{ archivedAt: null }` | the absence of a value |
| `{ status: undefined }` | skipped — an untouched filter never empties a list |
| `{ 'profile.city': 'Krakow' }` | a nested value or a jsonb column |

Operators: `$eq` `$ne` `$gt` `$gte` `$lt` `$lte` `$in` `$nin` `$exists` `$null` `$like` `$ilike`
`$regex` `$startsWith` `$endsWith` `$between` `$contains` `$contained` `$overlaps`. Composition:
`$and`, `$or`, `$not`. An operator a store cannot express raises `UnsupportedArgumentError`.

### `Sort<T>`

A bare field name sorts ascending; `{ field, order: 'asc' | 'desc' }` states it explicitly. `sort`
takes a list, applied left to right. Where an absent value lands is the store's rule: in memory and
in Postgres it sorts last ascending, in Mongo first.

### `ListResult<T>` and paging

`list()` answers `{ items, total, page?, size? }`. Paging is opt-in per call and each backend decides
what an unasked-for page means:

| Backend | `list(where)` with no `size` |
|---|---|
| mongo, postgres | a page of 100 records |
| redis, static, client-resource, config, state | every match |

`size: 0` means **no limit** everywhere. Asking for a `page` without a `size` on an unpaged backend
throws `UnsupportedArgumentError('page-without-size')`.

### Types

| Symbol | Kind | Purpose |
|---|---|---|
| `ResourceRecord` | interface | `{ id?: string }` — the constraint every record satisfies |
| `Resource<T>` | interface | the CRUD contract above; extends `BasicResource` from `@owlmeans/context` |
| `ResourceMaker<R, T>` | interface | `(dbAlias?, serviceAlias?) => T` — the maker signature |
| `Criteria<T>`, `FieldCriteria<V>`, `FieldOperators<V>` | types | the query language |
| `Sort<T>`, `SortField<T>` | types | ordering |
| `FirstOptions<T>` | interface | `{ sort? }` for `get`/`load` by criteria |
| `ListOptions<T>` | interface | `{ sort?, page?, size? }` for `list` |
| `ListQuery<T>` | interface | `ListOptions<T>` plus `where` — the one-object form an API carries |
| `ListResult<T>` | interface | `{ items, total, page?, size? }` |
| `WriteOptions`, `Ttl` | types | `{ ttl? }`; `number \| Date` |
| `PubSubResource<T>` | interface | `publish(value, channel?)`, `subscribe(handler, opts?) → Unsubscribe` |
| `WatchableResource<T>` | interface | `watch(id, handler, { once?, ttl? }?) → Unsubscribe` — one record |
| `StreamResource<T>` | interface | `stream(key, value)`, `consume(key, { group?, consumer?, block? }?)` |
| `LockableResource<T>` | interface | `lock(record, fields?)` / `unlock(record, fields?)` — field encryption at rest |
| `SubscribeOptions`, `Unsubscribe` | types | `{ channel?, once?, ttl? }`; `() => Promise<void>` |
| `MigratableResource<Tx, Self>` | interface | `migration(name, apply, stage?) → Self`, `migrations()` |
| `Migration<Tx>`, `MigrationRegistry<Tx>` | interfaces | a registered migration; the per-alias ledger |
| `MigrationStore<Tx>` | interface | the register a database implements: `ensure`/`applied`/`baseline`/`run` |
| `MigrationRunOptions`, `MigrationReport` | interfaces | `{ stage?, baseline?, strictChecksum? }`; `{ alias, stage, applied, baselined, skipped }` |
| `ResourceDbService<Db, Client>` | interface | a connection service: `db`/`client`/`clients`/`config`/`name`/`ensureConfigAlias`/`initialize` |
| `DbLocker<T>` | interface | `lock`/`unlock` by alias, for backends that encrypt fields |
| `DbConfig<P>` | interface | an entry of `cfg.dbs`: `service`, `alias?`, `host`, `port?`, `user?`, `secret?`, `schema?`, `resourcePrefix?`, `encryptionKey?`, `meta?` |
| `Config`, `Context` | interfaces | `BasicConfig` with `dbs?`; the matching `BasicContext` |

### Functions and constants

| Symbol | Kind | Purpose |
|---|---|---|
| `matchCriteria(record, where?)` | function | does one record satisfy the criteria |
| `filterRecords(records, where?)` | function | every match, in insertion order |
| `sortRecords(records, sort?)` | function | a sorted copy |
| `firstMatch(records, where?, { sort }?)` | function | the record `load(where)` returns |
| `applyQuery(records, where?, opts?)` | function | filter, sort and page into a `ListResult` |
| `createListSchema(schema)` | function | AJV `JSONSchemaType<ListResult<T>>` for a record schema |
| `filterObject(obj, keep?)` | function | drop null/undefined properties, keeping names in `keep` |
| `createDbService(alias, override, init?)` | function | base for `ResourceDbService` implementations; `name()` resolves `config.schema ?? config.alias ?? service.alias` |
| `createMigrationRegistry<Tx>()` | function | per-alias migration ledger; identical re-registration is a no-op |
| `runMigrations(alias, registry, store, opts?)` | function | apply one stage's pending migrations → `MigrationReport` |
| `MigrationStage` | enum | `Pre` (before structure reconciliation) / `Post` (after) |

### Errors

All extend `ResourceError` (itself a `ResilientError`) and are registered for marshalling.

| Symbol | Thrown when |
|---|---|
| `ResourceError` | base resource error |
| `UnknownRecordError` | a record is not found; `.id` returns the id |
| `RecordExists` | `create` hits a duplicate |
| `RecordUpdateFailed` | a write reached the backend but changed nothing |
| `MisshapedRecord` | a record has an invalid structure |
| `UnsupportedArgumentError` | an argument this backend cannot honour, e.g. `page-without-size` |
| `UnsupportedMethodError` | a method this backend does not implement |
| `MigrationError` | a migration body threw; initialization aborts |
| `MigrationConflict` | an applied migration's body changed, or a name was redeclared with a different body |

## Migration framework

Storage-agnostic and optional — a backend that supports code migrations (mongo, postgres) extends
`MigratableResource<Tx, Self>`; backends with nothing to migrate simply don't.

- Declaration order is application order; the registry never sorts by name.
- Both mongo and postgres persist the ledger as `_owlmeans_migrations`.
- On a just-created structure `runMigrations(..., { baseline: true })` records every migration
  instead of running it; otherwise a backend runs `Pre` → reconciles structure → runs `Post`.
- `strictChecksum` (default on) rejects an edited body of an already applied migration.

Adding migration support to a new backend: extend its interface with `MigratableResource<YourTx>`,
keep registrations in a module-scope declaration keyed by alias, implement `MigrationStore` over a
durable ledger, and make `run` atomic with the ledger write where the database allows it.

## Common pitfalls

- `take(id)` **deletes** the record it returns — never use it to fetch something.
- Writes have no `(id, changes)` overload: pass the record with its id inside. `update` replaces the
  whole record, so spread the loaded one first.
- Do not fetch one record with `list(...).items[0]` — `get(where)` / `load(where, { sort })` do it in
  one call.
- A bare array in criteria means "any of these"; an `undefined` value is skipped, not matched.
- `list()` without `size` returns 100 records on mongo/postgres but everything elsewhere; pass
  `size: 0` when you really want the whole set.
- `purge({})` is refused — bulk delete always names its criteria.
- Methods return records, never driver results — there is no `rowsAffected` to read.
- Sort on a required field when the position of absent values matters; it differs between stores.
- Never edit an applied migration — add a new one. Write its body inline in the callback: the
  checksum hashes the callback's source, so a wrapper delegating to a captured function never
  detects an edit.
- Install `@noble/hashes` and `@scure/base` alongside this package when you load
  `createMigrationRegistry` or `runMigrations`; install peer `ajv` when you use `createListSchema`.
- Scope organization data by `entityId` from `requireEntityKey(req)`, never by an id taken from the
  wire.

## Related packages

- [`@owlmeans/mongo-resource`](../mongo-resource) — MongoDB implementation, migratable
- [`@owlmeans/postgres-resource`](../postgres-resource) — PostgreSQL implementation, migratable
- [`@owlmeans/redis-resource`](../redis-resource) — Redis implementation with pub/sub, watch and streams
- [`@owlmeans/static-resource`](../static-resource) — in-memory implementation over config records
- [`@owlmeans/state`](../state) — the client store, with live subscriptions
- [`@owlmeans/client-resource`](../client-resource) — client-side caching over resources
- [`@owlmeans/context`](../context) — `registerResource` / `resource(alias)` and the lifecycle
- [`@owlmeans/error`](../error) — `ResilientError`, the base of every resource error

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.28
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
