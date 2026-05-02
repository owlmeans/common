# @owlmeans/server-module

Elevates route definitions into runnable server modules with attached request handlers.

## Overview

- `elevate(modules, alias, handler?, opts?)` attaches a `RefedModuleHandler` to an existing module in place
- `module(commonModule, handler?, opts?)` wraps a `CommonModule` into a `ServerModule`
- `guard(alias, opts?)` creates `ModuleOptions` requiring a named guard service
- Used internally by `@owlmeans/server-app`'s `elevate` re-export

## Installation

```bash
bun add @owlmeans/server-module
```

## Usage

Typical pattern — define modules separately, elevate with handlers:

```typescript
import { elevate, guard } from '@owlmeans/server-app'
import { handleBody, handleParams } from '@owlmeans/server-app'

const appModules = [
  module(route('project-create', '/projects', backend(RouteMethod.POST)), guard('auth')),
  module(route('project-get', '/projects/:id', backend())),
]

elevate(appModules, 'project-create', handleBody(async (payload, ctx) => {
  return await ctx.project().create(payload)
}))

elevate(appModules, 'project-get', handleParams(async (params, ctx) => {
  return await ctx.project().get(params.id)
}))
```

## API

### `elevate<R>(modules, alias, handler?, opts?): ServerModule<R>[]`

Mutates `modules` in-place: finds the module with `alias` and attaches `handler`. Throws if the alias is not found or already elevated (unless `opts.force` is true).

### `module<R>(commonModule, handler?, opts?): ServerModule<R>`

Wraps a single `CommonModule` into a `ServerModule`. Lower-level than `elevate`.

### `guard<R>(guard, opts?): ModuleOptions<R>`

Returns `ModuleOptions` that require the named guard service to pass before the handler runs.

### `ServerModule<R>`

Extends `CommonModule` with:
- `route: ServerRouteModel<R>` — resolved server route
- `handle: RefedModuleHandler<R>` — the attached handler

### `RefedModuleHandler<R>`

A handler factory: `(ref: { ref?: { ctx?: Context } }) => ModuleHandler`.

## Related Packages

- [`@owlmeans/module`](../module) — `CommonModule` base that gets elevated
- [`@owlmeans/server-api`](../server-api) — handler wrappers (`handleBody`, etc.) used with `elevate`
- [`@owlmeans/server-app`](../server-app) — re-exports `elevate`, `module`, `guard`
