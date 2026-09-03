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
await projects.list({ status: ['open', 'blocked'] }, { sort: ['createdAt'] })
```

The backing store comes from `cfg.dbs` — the entry whose `alias` matches the resource's, with
`schema` naming the store (`@owlmeans/web-db` supplies the browser one). Without an entry the
resource falls back to the default `client-db` service under its own alias.

## A key-value store dressed as a resource

Records live under their own id and a list of those ids under `LIST_KEY` is the only index there
is. So:

- `load(id)` / `get(id)` / `delete(id)` / `take(id)` address the key directly, no walk.
- `load(where)`, `get(where)`, `list`, `count` and `purge` read the whole set and evaluate through
  the shared in-memory engine from `@owlmeans/resource`, which is what makes a criteria object mean
  here exactly what it means against a relational store. `{ sort }` orders the result the same way.
- **Unpaged**: `list(where)` with no `size` returns every match; `size: 0` says the same thing
  explicitly, and `page` without `size` throws `UnsupportedArgumentError('page-without-size')`.
- `create` mints an id when the record carries none and throws `RecordExists` for one already
  stored; `update` **replaces** the whole record and throws `UnknownRecordError` for an unknown id;
  `save` creates or replaces. `take(id)` **deletes** the record it returns.
- `purge(where)` refuses an empty criteria object. `erase()` empties the store, index included.

## Depends On

- `@owlmeans/resource`, `@owlmeans/client-context`, `@scure/base`, `@noble/hashes`

## Related

- [[web-db]] — the browser IndexedDB backend behind `ClientDbService`
