# @owlmeans/server-entrypoint

Elevates route definitions into runnable server entrypoints with attached request handlers.

## Overview

- `elevate(entrypoints, alias, handler?, opts?)` attaches a `RefedEntrypointHandler` to an existing entrypoint in place
- `entrypoint(commonEntrypoint, handler?, opts?)` wraps a `CommonEntrypoint` into a `ServerEntrypoint`
- `guard(alias, opts?)` creates `EntrypointOptions` requiring a named guard service
- Used internally by `@owlmeans/server-app`'s `elevate` re-export

## Installation

```bash
bun add @owlmeans/server-entrypoint
```

## Usage

Typical pattern — define entrypoints separately, elevate with handlers:

```typescript
import { elevate, guard } from '@owlmeans/server-app'
import { handleBody, handleParams } from '@owlmeans/server-app'

const appModules = [
  entrypoint(route('project-create', '/projects', backend(RouteMethod.POST)), guard('auth')),
  entrypoint(route('project-get', '/projects/:id', backend())),
]

elevate(appModules, 'project-create', handleBody(async (payload, ctx) => {
  return await ctx.project().create(payload)
}))

elevate(appModules, 'project-get', handleParams(async (params, ctx) => {
  return await ctx.project().get(params.id)
}))
```

## API

### `elevate<R>(entrypoints, alias, handler?, opts?): ServerEntrypoint<R>[]`

Mutates `entrypoints` in-place: finds the entrypoint with `alias` and attaches `handler`. Throws if the alias is not found or already elevated (unless `opts.force` is true).

### `entrypoint<R>(commonEntrypoint, handler?, opts?): ServerEntrypoint<R>`

Wraps a single `CommonEntrypoint` into a `ServerEntrypoint`. Lower-level than `elevate`.

### `guard<R>(guard, opts?): EntrypointOptions<R>`

Returns `EntrypointOptions` that require the named guard service to pass before the handler runs.

### `ServerEntrypoint<R>`

Extends `CommonEntrypoint` with:
- `route: ServerRouteModel<R>` — resolved server route
- `handle: RefedEntrypointHandler<R>` — the attached handler

### `RefedEntrypointHandler<R>`

A handler factory: `(ref: { ref?: { ctx?: Context } }) => EntrypointHandler`.

## Related Packages

- [`@owlmeans/entrypoint`](../entrypoint) — `CommonEntrypoint` base that gets elevated
- [`@owlmeans/server-api`](../server-api) — handler wrappers (`handleBody`, etc.) used with `elevate`
- [`@owlmeans/server-app`](../server-app) — re-exports `elevate`, `entrypoint`, `guard`
