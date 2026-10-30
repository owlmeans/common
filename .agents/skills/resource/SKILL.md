---
name: resource
description: How to use @owlmeans/resource — generic resource abstraction (CRUD over records) plus the storage-agnostic migration framework (MigratableResource, migration registry/store/runner) used by mongo-resource, postgres-resource, redis-resource, state, storage-resource, etc. Auto-invoked when importing from this package, implementing a custom resource type, or adding migration support to a database backend.
user-invocable: false
---

# @owlmeans/resource

**Layer:** Core
**Install:** `"@owlmeans/resource": "^0.1.18"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ResourceRecord` | `{ id?: string }` — the constraint every record type satisfies, and the only field the contract itself knows about. |
| `Resource<T>` | Generic resource contract: `get`/`load`/`list`/`count`/`create`/`update`/`save`/`delete`/`take`/`purge`. Reads take **an id or a criteria object**; `list(where?, opts?)` takes `{ page, size, sort }` flat in the second argument. |
| `Criteria<T>`, `FieldCriteria<V>`, `FieldOperators<V>` | The query language, typed by the record — a mistyped field is a compile error. |
| `Sort<T>`, `SortField<T>`, `FirstOptions<T>`, `ListOptions<T>`, `ListQuery<T>`, `ListResult<T>` | Ordering, the read options, the one-object form an API carries over the wire, and the answer shape `{ items, total, page?, size? }`. |
| `WriteOptions`, `Ttl` | `{ ttl }` on `create`/`update`/`save`; seconds from now, or the instant to expire at. Backends without expiry refuse it. |
| `recordQueryHelper` — `matchCriteria`, `filterRecords`, `sortRecords`, `firstMatch`, `applyQuery` | The shared in-memory engine — one criteria object means the same thing in a browser store as it does in SQL. |
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
| Errors | `ResourceError`, `UnknownRecordError` (404), `MisshapedRecord`, `RecordExists` (409), `RecordUpdateFailed`, `UnsupportedArgumentError`, `UnsupportedMethodError`, `MigrationError`, `MigrationConflict` — the unmarked ones are faults (500). `tests/errors.spec.ts` refuses an exported class whose status was not decided. `UnknownRecordError.id` is everything after the first `/`, so an id or criteria text holding one survives. |
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

### What an escaped storage error answers

The two refusals declare their HTTP status (`static httpStatus`, the `error` skill's rule), so an
`@owlmeans/server-api` handler that lets one escape answers it: `UnknownRecordError` **404**,
`RecordExists` **409** (a unique-key violation, a taken id, and a `create` handed an id —
`id-present` — alike). Every other class of the family is a fault and answers 500. A development
body rebuilds into the same class on the client; a production body is the incident id alone and
arrives as `ApiStatusError` with that status (`@owlmeans/api`).

So `get` only what the REQUEST addressed. A missing row it did not name — a configuration record,
a session, an internal lookup — is not the caller's 404: `load` it and throw the fault or the
refusal that fits (an auth path throws `AuthorizationError`).

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

## Parts

Load a part on top of this core when its job is in play.

| Part | Load it when |
|---|---|
| [criteria](parts/criteria.md) | Writing a `where` (operators, `$or`, nested keys), a `sort`, or paging a `list` (`size`, `page`, `size: 0`) |
| [memory-engine](parts/memory-engine.md) | Implementing a store without a query engine, or narrowing a list already in hand (`recordQueryHelper`) |
| [capabilities](parts/capabilities.md) | Typing a resource with pub/sub, watch, stream, lock or migration capabilities |
| [migrations](parts/migrations.md) | Registering a migration or adding migration support to a database backend |
