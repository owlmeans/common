# @owlmeans/module

Module system — the URL unit abstraction shared between server and client in OwlMeans apps.

## Overview

- A **module** is a URL unit: an alias + path + optional guards/gates/filters
- On the server, modules become API routes with attached handlers
- On the client, modules provide URL generation and navigation
- All AJV validation schemas are defined at module level, keeping data contracts consistent fullstack
- Most commonly used via re-exports in `@owlmeans/server-app` or `@owlmeans/client-module`

## Installation

```bash
bun add @owlmeans/module
```

## Usage

Define a module with body validation and a guard:

```typescript
import { module, guard, filter, body, params } from '@owlmeans/server-app'
import { route } from '@owlmeans/route'

const createStoryModule = module(
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
import type { AbstractRequest } from '@owlmeans/module'

export const create = handleBody(async (body, context, request) => {
  const req = request as AbstractRequest<{ id: string }>
  const projectId = req.params.id
})
```

## API

### `module(route, opts?): CommonModule`

Creates a module. `opts` is typically produced by `filter()`, `guard()`, or `gate()`.

### `guard(guard, opts?): CommonModuleOptions`

Adds an authentication guard requirement.

### `gate(gate, params, opts?): CommonModuleOptions`

Adds an authorization gate with parameters.

### `filter(filter, opts?): CommonModuleOptions`

Attaches validation schemas (AJV format) to the module.

### `body(schema, filter?) / query(schema, filter?) / params(schema, filter?)`

Build a `Filter` object with the given AJV schema applied to the corresponding request part.

### `parent(module, parentAlias): CommonModule`

Sets a parent-child relationship so child modules inherit guards/gates.

### `provideResponse<T>(): AbstractResponse<T>`

Creates a response object for use in non-elevated handlers.

### `ModuleOutcome`

```typescript
enum ModuleOutcome { Ok, Accepted, Created, Finished }
```

### Types

- `AbstractRequest<T>` — request with `params`, `body`, `query`, `headers`, `auth`
- `AbstractResponse<T>` — response with `resolve(value, outcome?)` and `reject(error)`
- `CommonModule` — module with `getAlias()`, `getPath()`, `getGuards()`, `handle`

## Related Packages

- [`@owlmeans/route`](../route) — `route()` factory used in `module(route(...), ...)`
- [`@owlmeans/server-module`](../server-module) — server-side `elevate()` to attach handlers
- [`@owlmeans/client-module`](../client-module) — client-side module with API call support
- [`@owlmeans/server-app`](../server-app) — re-exports everything from this package
