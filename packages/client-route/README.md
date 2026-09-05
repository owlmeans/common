# @owlmeans/client-route

Client-side route model extension — marks routes as client-side and provides URL parameter utilities.

## Overview

- `route(routeModel, opts?)` — wraps a `RouteModel` into a `ClientRouteModel` (marks `_client: true`)
- `isClientRouteModel(route)` — type guard distinguishing client routes from server routes
- `extractParams(path)` — extracts path parameter names (`:param` segments) from a URL pattern
- Used internally by `@owlmeans/client-entrypoint` when building client-side entrypoint URLs

## Installation

```bash
bun add @owlmeans/client-route@^0.1.18-rc.12
```

## Usage

```typescript
import { route, isClientRouteModel, extractParams } from '@owlmeans/client-route'
import type { ClientRouteModel } from '@owlmeans/client-route'

// Wrap a route as a client route
const clientRoute = route(someRouteModel, { overrides: { service: 'api' } })

// Type guard
if (isClientRouteModel(arg)) {
  // arg is ClientRouteModel
}

// Extract named params from a path pattern
const params = extractParams('/projects/:projectId/items/:itemId')
// => ['projectId', 'itemId']
```

## API

### `route(route, opts?): ClientRouteModel`

Converts a `RouteModel` to a `ClientRouteModel`. Options: `overrides?: Partial<ClientRoute>` — the
overrides only fill in declaration fields that are still unset.

### `isClientRouteModel(route): route is ClientRouteModel`

Returns `true` if the route was created with `route()`.

### `extractParams(path): string[]`

Returns the list of `:param` segment names in a URL pattern string.

### `ClientRouteModel`

Extends `RouteModel` with the `_client: true` flag. It holds no address state: the declaration keeps
only the segment this route contributes, and the entrypoint answers `segment()`, `path()`, `mount()`
and `address()` on demand against the context that asks.

## Related Packages

- [`@owlmeans/route`](../route) — `RouteModel`, `RouteDeclaration` base types and the pure
  `resolvePath` / `resolveMount` / `resolveAddress` utilities under `@owlmeans/route/utils`
- [`@owlmeans/client-entrypoint`](../client-entrypoint) — uses `route()` and `isClientRouteModel()` when constructing entrypoints

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
