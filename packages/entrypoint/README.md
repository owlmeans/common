# @owlmeans/entrypoint

Entrypoint system — the URL unit abstraction shared between server and client in OwlMeans apps.

## Overview

- An **entrypoint** is a URL unit: an alias + a route declaration + optional guards/gates/filters
- On the server, entrypoints become API routes with attached handlers
- On the client, entrypoints provide URL generation and navigation
- All AJV validation schemas are defined at entrypoint level, keeping data contracts consistent fullstack
- Most commonly used via re-exports in `@owlmeans/server-app` or `@owlmeans/client-entrypoint`

The route declaration an entrypoint carries is immutable: its `path` always stays the segment this
entrypoint contributes under its parent. Addresses are computed on demand against the context the
entrypoint is registered in — `path()` walks the parent chain, `mount()` adds the service base,
`address()` picks host, port and scheme — so one declaration answers correctly on both sides.

## Installation

```bash
bun add @owlmeans/entrypoint@^0.1.18-rc.10
```

## Usage

Define an entrypoint with body validation and a guard:

```typescript
import { entrypoint, guard, filter, body, params } from '@owlmeans/server-app'
import { route } from '@owlmeans/route'

const createStoryEntrypoint = entrypoint(
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

### Parentship

A child names its parent in the route declaration (`route('story-create', '/stories', { parent: 'api' })`).
`path()` prefixes the parent's segments, and `getGuards()` / `getGates()` collect the parent's on
every call — so a guard added to a parent later still applies.

### `provideResponse<T>(): AbstractResponse<T>`

Creates a response object for use in non-elevated handlers.

### Transport

A route's protocol picks the carrier. Register a service under `transportAlias(protocol)` —
`transport:<protocol>` — implementing `EntrypointTransport { protocol, handle }`, and every call to
an entrypoint on that protocol goes through it. A consumer writes `ep.call(...)` and never learns
whether that became an HTTP request, a socket message or a queued job. Without a registered
transport the call goes over HTTP.

### `EntrypointOutcome`

```typescript
enum EntrypointOutcome { Ok, Accepted, Created, Finished }
```

### Types

- `AbstractRequest<T>` — request with `params`, `body`, `query`, `headers`, `auth`
- `AbstractResponse<T>` — response with `resolve(value, outcome?)` and `reject(error)`
- `CommonEntrypoint` — entrypoint with `alias`, `route`, `handle`, and the context-computed
  `segment()`, `path()`, `mount()`, `service()`, `address()`, `isLocal()`, `parent()`,
  `getGuards()`, `getGates()`
- `EntrypointTransport` — `{ protocol, handle }`, the service that carries a call for one protocol

## Related Packages

- [`@owlmeans/route`](../route) — `route()` factory used in `entrypoint(route(...), ...)`
- [`@owlmeans/server-entrypoint`](../server-entrypoint) — server-side `elevate()` to attach handlers
- [`@owlmeans/client-entrypoint`](../client-entrypoint) — client-side entrypoint with API call support
- [`@owlmeans/server-app`](../server-app) — re-exports everything from this package

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
