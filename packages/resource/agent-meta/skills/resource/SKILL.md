---
name: resource
description: How to use @owlmeans/resource — generic resource abstraction (CRUD over records) plus the storage-agnostic migration framework (MigratableResource, migration registry/store/runner) used by mongo-resource, postgres-resource, redis-resource, state, storage-resource, etc. Auto-invoked when importing from this package, implementing a custom resource type, or adding migration support to a database backend.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/resource

**Layer:** Core
**Install:** `"@owlmeans/resource": "^0.1.18-rc.9"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ResourceRecord` | `{ id?: string }` — the constraint every record type satisfies, and the only field the contract itself knows about. |
| `Resource<T>` | Generic resource contract: `get`/`load`/`list`/`count`/`create`/`update`/`save`/`delete`/`take`/`purge`. Reads take **an id or a criteria object**; `list(where?, opts?)` takes `{ page, size, sort }` flat in the second argument. |
| `Criteria<T>`, `FieldCriteria<V>`, `FieldOperators<V>` | The query language, typed by the record — a mistyped field is a compile error. |
| `Sort<T>`, `SortField<T>`, `FirstOptions<T>`, `ListOptions<T>`, `ListQuery<T>`, `ListResult<T>` | Ordering, the read options, the one-object form an API carries over the wire, and the answer shape `{ items, total, page?, size? }`. |
| `WriteOptions`, `Ttl` | `{ ttl }` on `create`/`update`/`save`; seconds from now, or the instant to expire at. Backends without expiry refuse it. |
| `matchCriteria`, `filterRecords`, `sortRecords`, `firstMatch`, `applyQuery` | The shared in-memory engine — one criteria object means the same thing in a browser store as it does in SQL. |
| `PubSubResource<T>`, `WatchableResource<T>`, `StreamResource<T>`, `LockableResource<T>` | **Optional capabilities**, composed into a concrete resource interface alongside `Resource<T>`. `SubscribeOptions` (`{ channel, once, ttl }`) and `Unsubscribe` come with the first two. |
| `MigratableResource<Tx, Self>` | **Optional migration capability** — `migration(name, apply, stage?)` (chainable) + `migrations()`. Optional the way pub/sub is on redis resources: mongo and postgres extend it, backends with nothing to migrate don't. |
| `Migration`, `MigrationRegistry`, `MigrationStore`, `MigrationReport`, `MigrationRunOptions` | The framework's contracts. `MigrationStore` is the *migration register* a database implements to track applied migrations (`ensure`/`applied`/`baseline`/`run`). |
| `createMigrationRegistry<Tx>()` | Storage-agnostic ledger of code-registered migrations per alias. Declaration order = application order; re-registering an identical body is a no-op, a changed body under a used name throws `MigrationConflict`. |
| `runMigrations(alias, registry, store, opts?)` | Apply one stage's pending migrations through a store. `baseline: true` records instead of running (fresh structures); `strictChecksum` (default on) rejects edited applied bodies. |
| `MigrationStage` | `Pre` (before structure reconciliation — renames, casts, rescues) / `Post` (after — backfills into new structure). |
| `createDbService` | Base for `ResourceDbService` implementations (config/alias/name/client plumbing). The service's `name(alias?)` resolves to `config.schema ?? config.alias ?? service.alias`. |
| `ResourceDbService<Db, Client>`, `DbLocker<T>` | What a connection service implements: `db`/`client`/`clients`/`config`/`name`/`ensureConfigAlias`/`initialize`, plus `lock`/`unlock` when the backend encrypts fields. |
| `ResourceMaker<R, T>` | `(dbAlias?, serviceAlias?) => T` — the signature every resource maker is typed with, so an app registers `makeXResource()` without repeating the argument list. |
| `filterObject(obj, keep?)`, `createListSchema` | Drop null and undefined properties, keeping the names listed in `keep`; the AJV schema for a `ListResult<T>` envelope. |
| Errors | `ResourceError`, `UnknownRecordError`, `MisshapedRecord`, `RecordExists`, `RecordUpdateFailed`, `UnsupportedArgumentError`, `UnsupportedMethodError`, `MigrationError`, `MigrationConflict`. |
| `DbConfig`, `Config`, `Context` | Database config (`cfg.dbs`) types. |

## Usage

A resource is a typed CRUD-over-records abstraction. Concrete implementations come from
`@owlmeans/mongo-resource`, `@owlmeans/postgres-resource`, `@owlmeans/redis-resource`,
`@owlmeans/state`, etc. Consumers register with the context and access via
`ctx.resource<T>(alias)`.

```typescript
import type { Resource } from '@owlmeans/resource'

interface Project { id: string; name: string; entityId: string; createdAt: Date }
const projects = ctx.resource<Resource<Project>>('projects')

// A read is addressed by an id OR by criteria — fetching one record by several fields is a
// single call, never a list whose first element is taken.
const project = await projects.get('abc123')
const newest = await projects.load({ entityId: 'abc' }, { sort: [{ field: 'createdAt', order: 'desc' }] })

// Paging and sort are FLAT in the second argument.
const page2 = await projects.list({ entityId: 'abc' }, { page: 1, size: 20, sort: ['createdAt'] })
page2.items      // the window
page2.total      // every record the criteria match, not just this page
```

### Calling the CRUD surface

A **write** takes the record as its only data argument, and the id travels inside it. There is no
`(id, changes)` overload on any of them — passing an id first fails to compile with
`TS2559: Type 'string' has no properties in common with type 'Partial<...>'`.

| Call | Signature | Notes |
|---|---|---|
| `create(record, opts?)` | `Partial<T> → T` | throws `RecordExists`; implementations may refuse a caller-supplied id |
| `save(record, opts?)` | `Partial<T> → T` | creates when the record carries no id, replaces otherwise |
| `update(record, opts?)` | `Partial<T> → T` | replaces the whole record; throws `UnknownRecordError` |

A **read** is addressed either by an id or by a criteria object. The id overload takes nothing
else; the criteria overload takes `{ sort }` to say which match is "the" one:

| Call | Signature | Notes |
|---|---|---|
| `load(id)` / `load(where, { sort })` | `→ T \| null` | the miss-tolerant read |
| `get(id)` / `get(where, { sort })` | `→ T` | throws `UnknownRecordError` instead of returning `null` |
| `list(where?, { page, size, sort })` | `→ { items, total, page?, size? }` | `total` counts every match, not the window |
| `count(where?)` | `→ number` | the same question without carrying the records back |
| `delete(id)` | `→ T \| null` | returns what it removed |
| `take(id)` | `→ T` | **deletes the record it returns.** It is a `delete` that throws `UnknownRecordError` on a miss, never a read — never reach for it to fetch something |
| `purge(where)` | `→ number` | bulk delete; refuses an empty criteria object rather than emptying the resource |

Every method returns the record(s) themselves, never a driver result object — there is no
`rowsAffected`/`rowCount` anywhere on this contract.

### The criteria language

`Criteria<T>` is keyed by the record's own fields, so a typo is a compile error. A dotted key
reaches into a nested value (or a jsonb column) and stays open.

| Written as | Means |
|---|---|
| `{ status: 'open' }` | equality |
| `{ status: ['open', 'done'] }` | **any of these** — a bare array is never exact-array equality (that is `{ $eq: [...] }`) |
| `{ archivedAt: null }` | the absence of a value |
| `{ status: undefined }` | **skipped** — an untouched filter must never empty a list |
| `{ 'profile.city': 'Kraków' }` | reach into a nested value or a jsonb column |

Operators go in an object under the field: `$eq $ne $gt $gte $lt $lte $in $nin $exists $null
$like $ilike $regex $startsWith $endsWith $between $contains $contained $overlaps`. Branches
combine with `$and` / `$or` / `$not`, each taking criteria of the same shape.

```typescript
await projects.list({
  entityId: 'abc',
  createdAt: { $gte: since },
  $or: [{ name: { $ilike: 'owl%' } }, { tags: { $overlaps: ['pinned'] } }]
})
```

Every backend answers the same object the same way — that is the point of the vocabulary. An
operator a store cannot express raises `UnsupportedArgumentError` rather than being quietly
dropped.

`Sort<T>` is a bare field name (ascending) or `{ field, order: 'asc' | 'desc' }`, and `sort` takes
a list of them. Where an **absent** value lands is the store's own rule, not the vocabulary's: the
in-memory sorter puts it last ascending, Postgres emits a bare `ASC` and so leaves it last (the
server's `NULLS LAST` default), and Mongo hands the sort document to the driver untouched, so BSON
ordering puts null and missing first. Sort on a field the schema requires when the position of an
absent value matters.

### Paging is a property of the backend

`ListResult<T>` is `{ items, total, page?, size? }` — `total` always counts every match. Whether a
missing `size` means "everything" depends on what the store can afford:

| Backend | `list(where)` with no `size` |
|---|---|
| mongo, postgres | a page of `DEFAULT_PAGE_SIZE` (100) — an unbounded read of a growing table is an incident waiting to happen |
| redis, static, client-resource, config, state | every match — answering the criteria already read the whole namespace, so an implied window would only hide records without saving work |

`size: 0` means **no limit** on every backend — the explicit, greppable way to ask for a whole
result set. `page` without `size` against an unpaged backend throws
`UnsupportedArgumentError('page-without-size')`: there is no implied default to take a window of.

### The shared in-memory engine

Every store without a query engine of its own — redis after its SCAN, the client and static
stores, state — filters through the same helpers, so a criteria object written for an endpoint
selects the same records when a screen applies it locally:

| Helper | Answers |
|---|---|
| `matchCriteria(record, where)` | does this one record match |
| `filterRecords(records, where)` | every match, in insertion order |
| `sortRecords(records, sort)` | a sorted copy |
| `firstMatch(records, where, { sort })` | the record `load(where)` / `get(where)` return |
| `applyQuery(records, where, opts)` | the whole `ListResult` — filter, sort and page in one call |

Reach for them when implementing a backend, and when narrowing a list already in hand rather than
going back to the store.

### Optional capabilities

A concrete resource interface composes the capabilities its backend actually has beside
`Resource<T>`; a consumer types the **resource** once and gets exactly those methods.

| Interface | Surface |
|---|---|
| `PubSubResource<T>` | `publish(value, channel?)` · `subscribe(handler, { channel?, once?, ttl? })` |
| `WatchableResource<T>` | `watch(id, handler, { once?, ttl? })` — changes to ONE record |
| `StreamResource<T>` | `stream(key, value)` · `consume(key, { group?, consumer?, block? })` |
| `LockableResource<T>` | `lock`/`unlock` — field level encryption at rest |
| `MigratableResource<Tx, Self>` | `migration(name, apply, stage?)` · `migrations()` |

## The migration framework

Migrations are **automatic on app setup**: a backend runs them inside the resource's
`init()` — registering one is all an app ever does. Every migration self-describes when it
applies: the registry skips names the store has recorded, `baseline` covers structures
created already at head, and bodies are written idempotent so an interrupted run can repeat.

Adding migration support to a new database backend:

1. Extend the concrete resource interface with `MigratableResource<YourTx>` and design the
   `Tx` façade a migration receives.
2. Keep registrations in a **module-scope declaration keyed by alias** — the shape mongo and
   postgres both expose as `getDeclaration(alias)` / `resetDeclarations(alias?)`. A maker that
   runs more than once for the same alias (a custom maker, a test) then re-declares the same
   entries and loses nothing, where a registry held on the resource object would silently lose
   data transformations.
3. Implement `MigrationStore` over a durable ledger when the database can store one
   (`_owlmeans_migrations` in both mongo and postgres); a store-less backend may run
   migrations unconditionally if its bodies are self-checking.
4. In the resource's `init()`: probe structure → absent: `runMigrations(..., { baseline: true })`;
   present: run `Pre` → reconcile structure → run `Post`.
5. Make `run` atomic with the ledger write where the database allows it (postgres: same
   transaction). Where it doesn't (mongo: no multi-doc transactions on standalone), use
   claim-then-complete on a unique `(alias, name)` key and require idempotent bodies.

## Depends On

- `@owlmeans/context` — service/resource lifecycle
- `@owlmeans/error` — `ResilientError`, the base every error class above extends
- peer `ajv` — `createListSchema` builds a `JSONSchemaType`; install it when you use that schema

The migration framework checksums bodies with `@noble/hashes` and `@scure/base`, and the package
declares neither. Install both alongside it in any project that loads `createMigrationRegistry` or
`runMigrations`, or the import fails at load time.

## Related

- [[mongo-resource]] · [[postgres-resource]] — the two `MigratableResource` implementations
- [[redis-resource]] — a non-migratable backend (pub/sub capability instead)
