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
  database. `purge(where)` refuses an empty criteria object.
- **Unpaged**: `list(where)` with no `size` returns every match — the whole store is already in
  memory; `size: 0` says the same explicitly, and `page` without `size` throws
  `UnsupportedArgumentError('page-without-size')`.
- `opts.ttl` is honoured on writes — a number is seconds from now, a `Date` the instant to expire
  at, and the record is dropped from the map when it elapses. An expiry already armed keeps its
  appointment: rewriting the record without a ttl does not cancel it, so a renewal passes the ttl
  again and a record that must survive gets a fresh id.

## Depends On

- `@owlmeans/resource`, `@owlmeans/context`
