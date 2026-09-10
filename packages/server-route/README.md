# @owlmeans/server-route

Server-side route model factory and request matcher for the Fastify integration layer.

## Overview

- `route()` wraps a `RouteModel` into a `ServerRouteModel` that Fastify can register
- Handles intermediate routes (parent routes without handlers) and request path matching
- Used internally by `elevate()` in `@owlmeans/server-entrypoint`
- Re-exported as `broute` from `@owlmeans/server-app`

## Installation

```bash
bun add @owlmeans/server-route@^0.1.18-rc.8
```

## Usage

Used automatically when calling `elevate()`. For explicit use:

```typescript
import { route as broute } from '@owlmeans/server-route'
// or via server-app:
import { broute } from '@owlmeans/server-app'

// Create a server-ready route model
const serverRoute = broute(routeModel, false)

// Match a request against it — the mounted path comes from the entrypoint
serverRoute.match(request, entrypoint.mount())
```

## API

### `route<R>(routeModel, intermediate, opts?): ServerRouteModel<R>`

Creates a `ServerRouteModel` from a `RouteModel`.
- `intermediate: true` — creates a parent route that groups children but has no own handler
- `opts.overrides` — declaration fields to fill in where the route left them unset
- `opts.pathField` — the request field carrying the path (default `url`)
- `opts.match` — replaces the built-in matcher entirely

### `ServerRouteModel<R>`

Extends `RouteModel` with:
- `isIntermediate(): boolean`
- `match(request, mount): boolean` — checks if this route handles the given request. The declaration
  states only the segment it contributes, so the caller supplies the mounted path — an entrypoint
  passes `ep.mount()`.

### `isServerRouteModel(obj): boolean`

Type guard to check if an entrypoint's route is already a `ServerRouteModel`.

## Related Packages

- [`@owlmeans/route`](../route) — `RouteModel` base type and the pure `resolveMount` /
  `resolveAddress` utilities under `@owlmeans/route/utils` that compute where a route answers
- [`@owlmeans/server-entrypoint`](../server-entrypoint) — calls `route()` internally when elevating
- [`@owlmeans/server-app`](../server-app) — re-exports `route` as `broute`

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
