# @owlmeans/route

Route model factory and type definitions for OwlMeans entrypoints.

## Overview

- `route()` creates a `RouteModel` used as the first argument to `protocol()` or `openProtocol()`
- `frontend()` / `backend()` / `socket()` / `job()` helpers set the route's `AppType`, parent, and transport
- `RouteMethod` enum covers HTTP verbs; `RouteProtocols` covers `http`/`ws`/`queue`
- This package is a dependency of `@owlmeans/entrypoint` — you rarely use it directly unless defining entrypoint-level routes

A `RouteDeclaration` is plain, immutable data: its `path` is the segment the route contributes under
its parent, and it is never rewritten. Where the route actually answers — the full path, the mount
under a service base, the host and scheme — is computed on demand from the declaration plus the
context that asks, so the same declaration serves a server and a browser alike.

## Installation

```bash
bun add @owlmeans/route@^0.1.18-rc.17
```

## Usage

Define routes for protocols:

```typescript
import { route, frontend, backend, job, socket, RouteMethod } from '@owlmeans/route'
import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'

const aliases = { stories: 'stories', create: 'stories:create', events: 'stories:events', generate: 'stories:generate' } as const
const stories = openProtocol(route(aliases.stories, '/stories', backend()))

// Backend REST route
const createProtocol = protocol(
  route(aliases.create, '/', backend({ parent: stories, method: RouteMethod.POST })),
  contract(typed<CreateStory>()),
)

// Frontend client route nested under parent
const storyProtocol = openProtocol(
  route('story-view', '/stories/:id', frontend({ parent: stories }))
)

// WebSocket route
const wsProtocol = protocol(
  route(aliases.events, '/events', socket({ parent: stories })),
  contract(typed<StoryEvent>()),
)

// Queue transport: the declaration names the service, queue, and response timeout.
const generateProtocol = protocol(
  route(aliases.generate, '/generate', job({ parent: stories, service: 'agent', queue: 'generation', timeout: 30_000 })),
  contract.request({ body: typed<GenerateStory>() }, typed<Story>()),
)
```

## API

### `route(alias, path, opts?): RouteModel`

Creates a route model. `path` is the segment this route contributes under its parent. `opts` can be a `RouteOptions` object or the result of `frontend()`, `backend()`, or `socket()`.

### `frontend(parent?, sticky?): Partial<RouteOptions>`

Returns options marking the route as frontend (`AppType.Frontend`), optionally with a parent alias.

### `backend(parent?, method?): Partial<RouteOptions>`

Returns options marking the route as backend (`AppType.Backend`), optionally with a parent alias and `RouteMethod`.

### `socket(options?): Partial<RouteOptions>`

Returns options for a WebSocket route with `RouteProtocols.SOCKET`.

### `job(options?): Partial<RouteOptions>`

Returns backend options for a queue-carried route with `RouteProtocols.QUEUE`. Queue declarations
must name `service`, `queue`, and `timeout`; `reply: false` resolves as soon as the broker accepts
the job. The process that consumes that queue is configured separately with `listenQueues()`.

### `RouteMethod`

```typescript
enum RouteMethod { GET, POST, PATCH, PUT, DELETE }
```

### `RouteProtocols`

```typescript
enum RouteProtocols { WEB = 'http', SOCKET = 'ws', QUEUE = 'queue' }
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

- [`@owlmeans/entrypoint`](../entrypoint) — `protocol()` and `openProtocol()` consume a `RouteModel`
- [`@owlmeans/server-app`](../server-app) — re-exports `route` as `broute` (backend) alongside `route`

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.20
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
