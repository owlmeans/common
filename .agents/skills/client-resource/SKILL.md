---
name: client-resource
description: How to use @owlmeans/client-resource — client-side resource caching layer over @owlmeans/resource for in-memory or persistent client storage. Auto-invoked when importing client resource primitives.
user-invocable: false
---

# @owlmeans/client-resource

**Layer:** Client
**Install:** `"@owlmeans/client-resource": "^0.1.18-rc.12"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `appendClientResource<C, T, R>(context, alias)` | Register a client-side `Resource<R>` on the context and return the context |
| `ClientResource<T>` | `Resource<T>` + `db` (the key-value handle) and `erase()` |
| `ClientDb`, `ClientDbService` | What a storage backend implements — `get`/`set`/`has`/`del`, and the service that hands out one store per alias |
| `DEFAULT_DB_ALIAS` (`client-db`), `LIST_KEY` (`_list`) | Constants |

## Usage

```typescript
import { appendClientResource } from '@owlmeans/client-resource'

appendClientResource<Config, Context, Project>(context, 'projects')

const projects = context.resource<ClientResource<Project>>('projects')
const { items, total } = await projects.list({ status: ['open', 'blocked'] }, { sort: ['createdAt'] })
```

The backing store comes from `cfg.dbs` — the `DbConfig` entry whose `alias` equals the resource's.
`service` is the field that selects the backend: it names the `ClientDbService` to ask, and it is
required by the type, as is `host`, which nothing on this path reads. `schema` names the store
inside that service and defaults to the resource alias. So an entry is
`{ alias: 'projects', service: MY_DB, host: [], schema? }`.

With no matching entry the resource asks `DEFAULT_DB_ALIAS` (`client-db`) for a store named after
itself — which is why a single-backend app (`@owlmeans/web-db` registered under that alias) writes
no `dbs` entries at all, and a second backend is chosen by adding one that names another service.

That binding happens in `init()`, which the context runs while it initializes. Every operation
before it throws `ResourceError('nodb-client-resource:<alias>')` — read that as "this resource was
used before its context was ready", not as a storage failure.

## A key-value store dressed as a resource

Records live under their own id and a list of those ids under `LIST_KEY` is the only index there
is. So:

- `load(id)` / `get(id)` / `delete(id)` / `take(id)` address the key directly, no walk.
- `load(where)`, `get(where)`, `list`, `count` and `purge` read the whole set and evaluate through
  the shared in-memory engine from `@owlmeans/resource`, which is what makes a criteria object mean
  here exactly what it means against a relational store. `{ sort }` orders the result the same way.
- `list` answers with the shared `ListResult` — `{ items, total }`, and `page` / `size` echoed back
  as well when a size was asked for. **Unpaged by default**: no `size` (or `size: 0`) returns every
  match, and `page` without `size` throws `UnsupportedArgumentError('page-without-size')`. The
  contract is the one every store shares — [[resource]].
- `create` mints a base58 id when the record carries none and throws `RecordExists` for one already
  stored; `update` **replaces** the whole record, throwing `MisshapedRecord('id')` for a record that
  carries no id and `UnknownRecordError` for an id the store does not hold; `save` creates when
  there is no id or no stored record and replaces otherwise. `take(id)` **deletes** the record it
  returns.
- `purge(where)` refuses an empty criteria object. `erase()` empties the store, index included.

## Depends On

- `@owlmeans/resource` (the shared criteria engine), `@owlmeans/client-context`, `@owlmeans/context`
- `@scure/base`, `@noble/hashes` — the base58 id minted for a record that arrives without one

## Related

- [[resource]] — the criteria engine, `ListResult` and the shared resource contract
- [[web-db]] — the browser IndexedDB backend behind `ClientDbService`
