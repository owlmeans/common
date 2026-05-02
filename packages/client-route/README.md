# @owlmeans/client-route

Client-side route model extension — marks routes as client-side and provides URL parameter utilities.

## Overview

- `route(routeModel, opts?)` — wraps a `CommonRouteModel` into a `ClientRouteModel` (marks `_client: true`)
- `isClientRouteModel(route)` — type guard distinguishing client routes from server routes
- `extractParams(path)` — extracts path parameter names (`:param` segments) from a URL pattern
- Used internally by `@owlmeans/client-module` when building client-side module URLs

## Installation

```bash
bun add @owlmeans/client-route
```

## Usage

```typescript
import { route, isClientRouteModel, extractParams } from '@owlmeans/client-route'
import type { ClientRouteModel } from '@owlmeans/client-route'

// Wrap a route as a client route
const clientRoute = route(someRouteModel, { overrides: { partialPath: '/items' } })

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

Converts a `CommonRouteModel` to a `ClientRouteModel`. Options: `overrides?: Partial<ClientRoute>`.

### `isClientRouteModel(route): route is ClientRouteModel`

Returns `true` if the route was created with `route()`.

### `extractParams(path): string[]`

Returns the list of `:param` segment names in a URL pattern string.

### `ClientRouteModel`

Extends `CommonRouteModel` with `_client: true` flag and `partialPath` for relative URL segments.

## Related Packages

- [`@owlmeans/route`](../route) — `CommonRouteModel`, `CommonRoute` base types
- [`@owlmeans/client-module`](../client-module) — uses `route()` and `isClientRouteModel()` when constructing modules
