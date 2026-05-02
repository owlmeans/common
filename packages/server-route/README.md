# @owlmeans/server-route

Server-side route model factory and request matcher for the Fastify integration layer.

## Overview

- `route()` wraps a `CommonRouteModel` into a `ServerRouteModel` that Fastify can register
- Handles intermediate routes (parent routes without handlers), internal service routes, and path matching
- Used internally by `elevate()` in `@owlmeans/server-module`
- Re-exported as `broute` from `@owlmeans/server-app`

## Installation

```bash
bun add @owlmeans/server-route
```

## Usage

Used automatically when calling `elevate()`. For explicit use:

```typescript
import { route as broute } from '@owlmeans/server-route'
// or via server-app:
import { broute } from '@owlmeans/server-app'

// Create a server-ready route model
const serverRoute = broute(commonRoute, false)
```

## API

### `route<R>(commonRoute, intermediate, opts?): ServerRouteModel<R>`

Creates a `ServerRouteModel` from a `CommonRouteModel`.
- `intermediate: true` — creates a parent route that groups children but has no own handler
- `opts.service` — internal service routes that proxy to another service

### `ServerRouteModel<R>`

Extends `CommonRouteModel` with:
- `isIntermediate(): boolean`
- `match(request): boolean` — checks if this route handles the given request
- `resolve(context): Promise<RouteModel>` — resolves the final route with service URL

### `isServerRouteModel(obj): boolean`

Type guard to check if a module's route is already a `ServerRouteModel`.

## Related Packages

- [`@owlmeans/route`](../route) — `CommonRouteModel` base type
- [`@owlmeans/server-module`](../server-module) — calls `route()` internally when elevating
- [`@owlmeans/server-app`](../server-app) — re-exports `route` as `broute`
