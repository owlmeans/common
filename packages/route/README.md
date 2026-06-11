# @owlmeans/route

Route model factory and type definitions for OwlMeans modules.

## Overview

- `route()` creates a `CommonRouteModel` used as the first argument to `module()`
- `frontend()` / `backend()` / `socket()` helpers set the route's `AppType` and parent
- `RouteMethod` enum covers HTTP verbs; `RouteProtocols` covers `http`/`ws`
- This package is a dependency of `@owlmeans/module` — you rarely use it directly unless defining module-level routes

## Installation

```bash
bun add @owlmeans/route
```

## Usage

Define routes for modules (typically via `@owlmeans/server-app` re-exports):

```typescript
import { route, frontend, backend, socket, RouteMethod } from '@owlmeans/route'
import { module } from '@owlmeans/module'

// Backend REST route
const createRoute = module(
  route('story-create', '/stories', backend('api', RouteMethod.POST))
)

// Frontend client route nested under parent
const storyRoute = module(
  route('story-view', '/stories/:id', frontend('app'))
)

// WebSocket route
const wsRoute = module(
  route('story-ws', '/stories/stream', socket('api'))
)
```

## API

### `route(alias, path, opts?): CommonRouteModel`

Creates a route model. `opts` can be a `RouteOptions` object or the result of `frontend()`, `backend()`, or `socket()`.

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

## Related Packages

- [`@owlmeans/module`](../module) — `module()` takes a `CommonRouteModel` as first argument
- [`@owlmeans/server-app`](../server-app) — re-exports `route` as `broute` (backend) alongside `route`

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
