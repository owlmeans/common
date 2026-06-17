# @owlmeans/client-resource

Client-side resource persistence layer — browser key-value storage backed resource for the OwlMeans `Resource<T>` interface.

## Overview

- `appendClientResource(context, alias)` — registers a client-side resource under `alias` in the context
- `ClientResource<T>` — extends `Resource<T>` with `db` accessor and `erase()` method
- `ClientDbService` / `ClientDb` — low-level key-value store interface (`get`, `set`, `has`, `del`)
- Used by `client-did`, `client-auth`, `web-flow`, and `web-db` to persist data in the browser

## Installation

```bash
bun add @owlmeans/client-resource
```

## Usage

Register a client resource in context setup:

```typescript
import { appendClientResource } from '@owlmeans/client-resource'

appendClientResource(context, 'my-resource')
```

Use the resource via the context:

```typescript
import type { ClientResource } from '@owlmeans/client-resource'

const res = context.resource<ClientResource<MyRecord>>('my-resource')
await res.save({ id: 'key', ...data })
const record = await res.load('key')
await res.erase() // clear all stored data
```

## API

### `appendClientResource<C, T>(context, alias): T`

Appends a client resource with the given `alias` to `context`. Returns the context for chaining.

### `ClientResource<T>`

Extends `Resource<T>` with:
- `db?: ClientDb` — underlying key-value store
- `erase(): Promise<void>` — wipe all stored records

### `ClientDb`

Low-level browser storage interface:
- `get<T>(id): Promise<T>`
- `set<T>(id, value): Promise<void>`
- `has(id): Promise<boolean>`
- `del(id): Promise<boolean>`

### Constants

- `DEFAULT_DB_ALIAS` — `'client-db'` — default alias for the underlying DB service
- `LIST_KEY` — `'_list'` — key used to store the record index

## Related Packages

- [`@owlmeans/resource`](../resource) — `Resource<T>`, `ResourceRecord` base interfaces
- [`@owlmeans/web-db`](../web-db) — IndexedDB-backed implementation of `ClientDbService`
- [`@owlmeans/client-did`](../client-did) — uses `appendClientResource` to persist DID keys

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded Claude Code skills and GitHub Copilot instructions under
`agent-meta/`. After installing your `@owlmeans/*` packages, run the OwlMeans
agent-skills installer to place them into your project's native locations
(`.claude/skills/` and `.github/instructions/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
