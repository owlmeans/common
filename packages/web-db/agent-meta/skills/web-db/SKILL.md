---
name: web-db
description: How to use @owlmeans/web-db — browser IndexedDB-backed storage service for client-side persistence. Auto-invoked when importing the web DB service.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-db

**Layer:** Web (React)
**Install:** `"@owlmeans/web-db": "^0.1.18-rc.14"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `appendWebDbService(context, alias?)` | Register the service on a client context and return the context |
| `makeWebDbService(alias?)` | The bare service, when you register it yourself |
| `WebDbService` | The `ClientDbService` contract from [[client-resource]] — `initialize(alias?)`, `erase()` |
| `DEFAULT_ALIAS` | `client-db`, the same alias `@owlmeans/client-resource` looks for |

## Usage

```typescript
import { appendWebDbService } from '@owlmeans/web-db'
import { appendClientResource } from '@owlmeans/client-resource'

appendWebDbService(context)
appendClientResource<Config, Context, Project>(context, 'projects')
```

This package supplies the **storage**, not the query surface: it hands
`@owlmeans/client-resource` a `ClientDb` over `idb-keyval`, and that resource is what answers
`get`/`load`/`list`/`count`/`create`/`update`/`save`/`delete`/`take`/`purge`, criteria and `{ sort }`
included. Every read walks the whole store: all records are loaded out of IndexedDB and the criteria
applied in memory. `list(where)` with no `size` therefore answers **every** match, and `size: 0`
says the same explicitly; a `size` does slice `page * size` out of what was already read, so paging
saves the read nothing. `page` without `size` raises
`UnsupportedArgumentError('page-without-size')`.

`initialize(alias)` returns one `ClientDb` per alias, memoised, and prefixes every key with that
alias, so two resources on one browser never collide. `erase()` clears the **whole** IndexedDB
store, every alias at once — a per-resource wipe is `ClientResource.erase()`.

## Depends On

- `@owlmeans/client-resource`, `@owlmeans/client-context`, `@owlmeans/context`
- `idb-keyval` (runtime) — IndexedDB behind it

## Related

- [[client-resource]] — the resource this service backs
