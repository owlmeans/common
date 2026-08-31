# @owlmeans/web-db

IndexedDB-backed client database service for OwlMeans web applications.

## Overview

- `makeWebDbService(alias?)` — creates an IndexedDB-backed `ClientDbService`
- `appendWebDbService(context, alias?)` — registers the DB service in the context
- Implements `ClientDb`: `get`, `set`, `has`, `del`, `erase` over `idb-keyval`
- Used internally by `@owlmeans/web-client`'s `makeContext` to back `client-resource` storage

## Installation

```bash
bun add @owlmeans/web-db
```

## Usage

This package is registered automatically when using `makeContext` from `@owlmeans/web-client`. Direct use is only needed for custom context setup:

```typescript
import { appendWebDbService } from '@owlmeans/web-db'

appendWebDbService(context)
```

Access the DB directly:

```typescript
import { DEFAULT_ALIAS } from '@owlmeans/web-db'
import type { WebDbService } from '@owlmeans/web-db'

const dbService = context.service<WebDbService>(DEFAULT_ALIAS)
const db = await dbService.initialize('my-store')

await db.set('key', { value: 123 })
const record = await db.get<MyType>('key')
await db.del('key')
```

## API

### `makeWebDbService(alias?): WebDbService`

Creates an IndexedDB service. `alias` defaults to `DEFAULT_ALIAS`.

### `appendWebDbService<C, T>(context, alias?): T`

Registers the DB service in the context.

### `WebDbService`

Extends `ClientDbService` with `initialize(alias?)` returning a `ClientDb`:
- `get<T>(id): Promise<T>`
- `set<T>(id, value): Promise<void>`
- `has(id): Promise<boolean>`
- `del(id): Promise<boolean>`

## Related Packages

- [`@owlmeans/client-resource`](../client-resource) — `ClientDbService` interface this implements
- [`@owlmeans/web-client`](../web-client) — calls `appendWebDbService` inside `makeContext`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
