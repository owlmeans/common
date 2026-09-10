# @owlmeans/server-entrypoint

Elevates route definitions into runnable server entrypoints with attached request handlers.

## Overview

- `elevate(entrypoints, alias, handler?, opts?)` attaches a `RefedEntrypointHandler` to an existing entrypoint in place
- `entrypoint(commonEntrypoint, handler?, opts?)` wraps a `CommonEntrypoint` into a `ServerEntrypoint`
- `guard(alias, opts?)` creates `EntrypointOptions` requiring a named guard service
- Used internally by `@owlmeans/server-app`'s `elevate` re-export

## Installation

```bash
bun add @owlmeans/server-entrypoint@^0.1.18-rc.10
```

## Usage

Typical pattern — define entrypoints separately, elevate with handlers:

```typescript
import { elevate, guard } from '@owlmeans/server-app'
import { handleBody, handleParams } from '@owlmeans/server-app'

const appEntrypoints = [
  entrypoint(route('project-create', '/projects', backend(RouteMethod.POST)), guard('auth')),
  entrypoint(route('project-get', '/projects/:id', backend())),
]

elevate(appEntrypoints, 'project-create', handleBody(async (payload, ctx) => {
  return await ctx.project().create(payload)
}))

elevate(appEntrypoints, 'project-get', handleParams(async (params, ctx) => {
  return await ctx.project().get(params.id)
}))
```

## API

### `elevate<R>(entrypoints, alias, handler?, opts?): ServerEntrypoint<R>[]`

Replaces the element carrying `alias` with its elevated counterpart, in place, attaching `handler`. Elevating the same alias again just replaces it again; guards passed here are added to the ones the entrypoint declared. Throws when no entrypoint carries the alias.

### `entrypoint<R>(commonEntrypoint, handler?, opts?): ServerEntrypoint<R>`

Wraps a single `CommonEntrypoint` into a `ServerEntrypoint`. Lower-level than `elevate`.

### `guard<R>(guard, opts?): EntrypointOptions<R>`

Returns `EntrypointOptions` that require the named guard service to pass before the handler runs.

### `ServerEntrypoint<R>`

Extends `CommonEntrypoint` with:
- `route: ServerRouteModel<R>` — the server route declaration; `route.match(request, entrypoint.mount())`
  answers whether a request hits it
- `handle: RefedEntrypointHandler<R>` — the attached handler

### `RefedEntrypointHandler<R>`

A handler factory: `(ref: { ref?: { ctx?: Context } }) => EntrypointHandler`.

## Related Packages

- [`@owlmeans/entrypoint`](../entrypoint) — `CommonEntrypoint` base that gets elevated
- [`@owlmeans/server-api`](../server-api) — handler wrappers (`handleBody`, etc.) used with `elevate`
- [`@owlmeans/server-app`](../server-app) — re-exports `elevate`, `entrypoint`, `guard`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.12
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
