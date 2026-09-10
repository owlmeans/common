# @owlmeans/route

Route model factory and type definitions for OwlMeans entrypoints.

## Overview

- `route()` creates a `RouteModel` used as the first argument to `entrypoint()`
- `frontend()` / `backend()` / `socket()` helpers set the route's `AppType` and parent
- `RouteMethod` enum covers HTTP verbs; `RouteProtocols` covers `http`/`ws`
- This package is a dependency of `@owlmeans/entrypoint` — you rarely use it directly unless defining entrypoint-level routes

A `RouteDeclaration` is plain, immutable data: its `path` is the segment the route contributes under
its parent, and it is never rewritten. Where the route actually answers — the full path, the mount
under a service base, the host and scheme — is computed on demand from the declaration plus the
context that asks, so the same declaration serves a server and a browser alike.

## Installation

```bash
bun add @owlmeans/route@^0.1.18-rc.8
```

## Usage

Define routes for entrypoints (typically via `@owlmeans/server-app` re-exports):

```typescript
import { route, frontend, backend, socket, RouteMethod } from '@owlmeans/route'
import { entrypoint } from '@owlmeans/entrypoint'

// Backend REST route
const createEntrypoint = entrypoint(
  route('story-create', '/stories', backend('api', RouteMethod.POST))
)

// Frontend client route nested under parent
const storyEntrypoint = entrypoint(
  route('story-view', '/stories/:id', frontend('app'))
)

// WebSocket route
const wsEntrypoint = entrypoint(
  route('story-ws', '/stories/stream', socket('api'))
)
```

## API

### `route(alias, path, opts?): RouteModel`

Creates a route model. `path` is the segment this route contributes under its parent. `opts` can be a `RouteOptions` object or the result of `frontend()`, `backend()`, or `socket()`.

### `frontend(parent?, sticky?): Partial<RouteOptions>`

Returns options marking the route as frontend (`AppType.Frontend`), optionally with a parent alias.

### `backend(parent?, method?): Partial<RouteOptions>`

Returns options marking the route as backend (`AppType.Backend`), optionally with a parent alias and `RouteMethod`.

### `socket(parent?): Partial<RouteOptions>`

Returns options for a WebSocket route with `RouteProtocols.SOCKET`.

### `RouteMethod`

```typescript
enum RouteMethod { GET, POST, PATCH, PUT, DELETE }
```

### `RouteProtocols`

```typescript
enum RouteProtocols { WEB = 'http', SOCKET = 'ws' }
```

The protocol also selects the transport that carries a call to an entrypoint on this route.

### Types

- `RouteDeclaration` — the plain, immutable data a `route()` call produces: `alias`, `path`,
  `parent`, `method`, `protocol`, `secure`, plus the service coordinates
- `RouteModel` — `{ route: RouteDeclaration }`, the model an entrypoint carries
- `RouteAddress` — `{ host, port?, base?, secure, protocol }`, where a route answers once its
  service has been picked

### `@owlmeans/route/utils`

The pure functions the entrypoint accessors are built on. Each takes a context and a declaration:

- `resolveService(ctx, route)` / `isLocalRoute(ctx, route)`
- `resolvePath(ctx, route)` — the route's segment under every ancestor's
- `resolveMount(ctx, route)` — that path under the service base
- `resolveAddress(ctx, route)` — host, port, scheme and protocol

## Related Packages

- [`@owlmeans/entrypoint`](../entrypoint) — `entrypoint()` takes a `RouteModel` as first argument
- [`@owlmeans/server-app`](../server-app) — re-exports `route` as `broute` (backend) alongside `route`

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
