---
name: static-resource
description: How to use @owlmeans/static-resource — in-process Resource over a module-scope Map, for records an app holds in memory (fixtures, caches, short-lived handshake state). Auto-invoked when registering an in-memory resource on a context.
user-invocable: false
---

# @owlmeans/static-resource

**Layer:** Infra
**Install:** `"@owlmeans/static-resource": "^0.1.18-rc.8"` in `dependencies`

The whole `Resource` contract over a `Map` held at module scope. Use it where records must be
reachable through the context like any other resource but have no database behind them — fixtures,
a process-local cache, short-lived handshake state.

## Key Exports

| Export | Description |
|--------|-------------|
| `appendStaticResource(context, alias?, key?)` | Register one on the context and add `getStaticResource(alias?)` to it |
| `createStaticResource<T>(alias?, key?)` | The bare `Resource<T>`, when you register it yourself |
| `StaticResourceAppend` | The `getStaticResource` accessor the append adds |
| `DEFAULT_ALIAS` (`static`) | Constant |

`key` names the underlying store, defaulting to the alias — two resources sharing a `key` share
records, which is how two contexts in one process see the same set.

## Usage

```typescript
import { appendStaticResource } from '@owlmeans/static-resource'

appendStaticResource(context, 'fixtures')

const fixtures = context.getStaticResource<Fixture>('fixtures')
await fixtures.save({ id: 'seed', name: 'Owl' })
await fixtures.list({ name: { $startsWith: 'Owl' } }, { sort: ['name'] })
```

## Semantics

- The store is a map keyed by id and there is nothing here to mint one from, so **every write
  needs an id**: `create`, `update` and `save` all throw `MisshapedRecord('id')` without one.
  `create` additionally throws `RecordExists`, `update` `UnknownRecordError`; `save` is the upsert.
- `load(id)` / `get(id)` / `delete(id)` / `take(id)` hit the map directly. `take(id)` **deletes**
  the record it returns and throws `UnknownRecordError` on a miss.
- `load(where)`, `get(where)`, `list`, `count` and `purge` go through the shared in-memory engine
  from `@owlmeans/resource`, so criteria and `{ sort }` mean exactly what they mean against a
  database. `purge(where)` refuses an empty criteria object
  (`UnsupportedArgumentError('purge:empty-criteria')` — the database backends spell the same
  refusal `purge:no-criteria`, so match on the error type rather than the message).
- **Unpaged**: `list(where)` with no `size` returns every match — the whole store is already in
  memory; `size: 0` says the same explicitly, and `page` without `size` throws
  `UnsupportedArgumentError('page-without-size')`.
- `opts.ttl` on a write arms a timer that deletes the id when it elapses — a number is seconds from
  now, a `Date` the instant to expire at.
- **An armed expiry cannot be postponed.** Nothing ever clears a timer, so a later write — with a
  ttl or without one — leaves the original running, and when it fires it deletes whatever record now
  sits under that id. Passing the ttl again renews nothing; it only adds a second timer behind the
  first. A record that has to outlive its first ttl needs a fresh id.
- **The map holds the caller's own object.** `create`/`update`/`save` store the object handed in and
  `load`/`get`/`list` hand it straight back — no clone, no serialization. Mutating a record you
  saved or read rewrites the store in place, bypassing `update` entirely, which is not how the
  database backends behave. Copy before mutating, or treat what comes out of here as frozen.

## Depends On

- `@owlmeans/resource`, `@owlmeans/context`
