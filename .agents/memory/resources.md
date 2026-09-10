---
node: resources
scope: "packages/resource/**, packages/*-resource/**, packages/{mongo,postgres,redis}/**, packages/state/**"
updated: 2026-09
---

# Resources (storage contract + backends)

`@owlmeans/resource` states one typed CRUD contract; mongo, postgres, redis, the in-memory stores
and the client state store all answer it. Resources are registered on the container ([[context]]).

## Facts

- The vocabulary: `get(id | where, { sort })` and `load(id | where, { sort })` (get throws on
  absence, load answers `null`), `list(where?, { sort, page, size })`, `count(where?)`,
  `create` / `update` / `save(record, { ttl? })`, `delete(id)`, `take(id)`, `purge(where)`.
  A read by several fields is one call, never a list whose first element is taken.
- `list` answers `{ items, total, page?, size? }` — the page and size only when the answer was
  actually paged.
- `Criteria<T>` is typed by the record, so a mistyped field is a compile error. A bare value is
  equality, a bare ARRAY is "any of these", `null` matches absence, and `undefined` is SKIPPED so
  an untouched filter never empties a list. Operators: `$eq $ne $gt $gte $lt $lte $in $nin
  $exists $null $like $ilike $regex $startsWith $endsWith $between $contains $contained
  $overlaps`, combined with `$and` / `$or` / `$not`. A dotted key reaches into a nested value or a
  jsonb column.
- `Sort<T>` is a bare field name (ascending) or `{ field, order: 'asc' | 'desc' }`.
- `take(id)` is delete-and-return, and it throws when the record is absent — the consume-once read.
  The name is the warning; `delete(id)` is the form that tolerates absence.
- Optional capabilities are separate interfaces an implementation composes in, never part of the
  base contract: `PubSubResource` (`publish`, `subscribe(handler, { channel?, once?, ttl? })`),
  `WatchableResource` (`watch`), `StreamResource` (`stream` / `consume`), `LockableResource`
  (encryption at rest) and `MigratableResource<Tx, Self>`. A backend that cannot do one simply
  does not implement it, so a capability is a type question, not a runtime probe.
- Migrations register on the resource — `resource.migration(name, fn, stage)`, chainable and
  idempotent — and run during resource initialization; `runMigrations` stays storage-agnostic.
- `dbName()` is `config.schema ?? config.alias ?? service.alias`.
- `@owlmeans/state` is an async `Resource` registered on the context plus `PubSubResource`. It adds
  `replace(records)` (write these, drop everything the list does not name — the authoritative-list
  verb), `clear()`, `watch(id, listener)` and `query(where, listener, opts?)` for live reads.
  `StateModel` is `{ id, empty, record, update, commit, clear }`.

## Invariants

- **Paging is per backend; `size: 0` means NO LIMIT on every one of them.** Mongo and postgres page
  by 100 when no size is asked for; redis and the unindexed stores (static, client-resource,
  config, state) are unpaged and return everything. `page` without `size` on an unpaged backend
  throws `UnsupportedArgumentError('page-without-size')` rather than silently answering page 0.
- The in-memory engine — `matchCriteria`, `filterRecords`, `sortRecords`, `firstMatch`,
  `applyQuery`, exported from `@owlmeans/resource` — is shared by every store without an index, so
  one criteria object means the same thing filtered in SQL by an endpoint and locally by a screen.
  Widening the operator set means widening the engine AND each backend's translator together, or
  the two answers diverge.
- `purge` refuses an empty criteria object rather than emptying the resource.
- `empty` is how a state model says "nothing is loaded": no sentinel id, and a subscription to an
  unknown id invents no placeholder record and leaves the store exactly as empty as it found it.

## Gotchas

- Redis answers only reads by id from a key. Every criteria read, listing, count and purge walks
  the resource's own namespace with SCAN and evaluates in memory — affordable for a small
  namespaced set, wrong for anything unbounded, and **not cluster-safe**, since the walk reaches
  one server. Anything that needs real queries belongs in mongo or postgres.
- `watch` is redis keyspace notification, bound to db 0 and needing `notify-keyspace-events` on the
  server. A deployment that puts its records on another database is told nothing and reports no
  error.
