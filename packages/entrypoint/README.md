# @owlmeans/entrypoint

Entrypoint system — the URL unit abstraction shared between server and client in OwlMeans apps.

## Overview

- An **entrypoint** is a URL unit: an alias + path + optional guards/gates/filters
- On the server, entrypoints become API routes with attached handlers
- On the client, entrypoints provide URL generation and navigation
- All AJV validation schemas are defined at entrypoint level, keeping data contracts consistent fullstack
- Most commonly used via re-exports in `@owlmeans/server-app` or `@owlmeans/client-entrypoint`

## Installation

```bash
bun add @owlmeans/entrypoint
```

## Usage

Define an entrypoint with body validation and a guard:

```typescript
import { entrypoint, guard, filter, body, params } from '@owlmeans/server-app'
import { route } from '@owlmeans/route'

const createStoryModule = entrypoint(
  route('story-create', '/stories', { method: 'POST', parent: 'api' }),
  filter(body({
    type: 'object',
    properties: { story: { type: 'string' }, projectId: { type: 'string' } },
    required: ['story', 'projectId']
  }), guard('authenticated'))
)
```

Use `AbstractRequest` type in a handler:

```typescript
import type { AbstractRequest } from '@owlmeans/entrypoint'

export const create = handleBody(async (body, context, request) => {
  const req = request as AbstractRequest<{ id: string }>
  const projectId = req.params.id
})
```

## API

### `entrypoint(route, opts?): CommonEntrypoint`

Creates an entrypoint. `opts` is typically produced by `filter()`, `guard()`, or `gate()`.

### `guard(guard, opts?): CommonEntrypointOptions`

Adds an authentication guard requirement.

### `gate(gate, params, opts?): CommonEntrypointOptions`

Adds an authorization gate with parameters.

### `filter(filter, opts?): CommonEntrypointOptions`

Attaches validation schemas (AJV format) to the entrypoint.

### `body(schema, filter?) / query(schema, filter?) / params(schema, filter?)`

Build a `Filter` object with the given AJV schema applied to the corresponding request part.

### `parent(entrypoint, parentAlias): CommonEntrypoint`

Sets a parent-child relationship so child entrypoints inherit guards/gates.

### `provideResponse<T>(): AbstractResponse<T>`

Creates a response object for use in non-elevated handlers.

### `EntrypointOutcome`

```typescript
enum EntrypointOutcome { Ok, Accepted, Created, Finished }
```

### Types

- `AbstractRequest<T>` — request with `params`, `body`, `query`, `headers`, `auth`
- `AbstractResponse<T>` — response with `resolve(value, outcome?)` and `reject(error)`
- `CommonEntrypoint` — entrypoint with `getAlias()`, `getPath()`, `getGuards()`, `handle`

## Related Packages

- [`@owlmeans/route`](../route) — `route()` factory used in `entrypoint(route(...), ...)`
- [`@owlmeans/server-entrypoint`](../server-entrypoint) — server-side `elevate()` to attach handlers
- [`@owlmeans/client-entrypoint`](../client-entrypoint) — client-side entrypoint with API call support
- [`@owlmeans/server-app`](../server-app) — re-exports everything from this package

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
