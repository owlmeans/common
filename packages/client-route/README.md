# @owlmeans/client-route

Client-side routing library for OwlMeans applications that extends the base `@owlmeans/route` package with client-specific functionality.

## Overview

The `@owlmeans/client-route` package is a client-side extension of the `@owlmeans/route` module, providing additional functionality specifically designed for frontend applications. It extends the base routing capabilities with client-specific features such as partial path preservation and parameter extraction.

This package is part of the OwlMeans Common library suite and follows the OwlMeans Common Module approach (described in `@owlmeans/context`). Like other modules in the suite, it's designed to work within the OwlMeans Common Module ecosystem and is not self-sufficient.

### Key Features

- **Client Route Models** - Extends base route models with client-specific behavior
- **Partial Path Preservation** - Maintains original path patterns for client-side processing
- **Parameter Extraction** - Utility functions for extracting route parameters
- **Promise-based Resolution** - Manages asynchronous route resolution with state tracking
- **Type Safety** - Full TypeScript support with proper type definitions

## Installation

```bash
npm install @owlmeans/client-route
```

**Note:** This package depends on `@owlmeans/route` and `@owlmeans/client-context`, which will be installed automatically.

## Core Concepts

### Client Route
A client route extends the base `CommonRoute` with additional client-specific properties, particularly the `partialPath` which preserves the original path pattern for client-side processing.

### Client Route Model
A client route model wraps a client route with additional behavior, including promise-based resolution tracking and client-specific resolution logic.

### Parameter Extraction
The package provides utilities to extract parameters from route paths, useful for client-side routing and navigation.

## API Reference

### Types

#### ClientRoute
Extended route interface with client-specific properties.

```typescript
interface ClientRoute extends CommonRoute {
  partialPath: string  // Original path pattern preserved for client use
}
```

**Properties:**
- **partialPath**: `string` - The original path pattern before resolution, useful for client-side routing logic

#### ClientRouteModel
Extended route model with client-specific resolution behavior.

```typescript
interface ClientRouteModel extends CommonRouteModel {
  route: ClientRoute           // The wrapped client route
  _resolved?: Promise<void>    // Promise tracking resolution state
  _client: true               // Client route marker
}
```

**Properties:**
- **route**: `ClientRoute` - The wrapped client route object
- **_resolved**: `Promise<void>` - Optional promise that tracks the resolution state
- **_client**: `true` - Marker indicating this is a client route model

#### ClientRouteOptions
Options for configuring client routes.

```typescript
interface ClientRouteOptions {
  overrides?: Partial<ClientRoute>  // Route parameter overrides
}
```

**Properties:**
- **overrides**: `Partial<ClientRoute>` - Optional route parameter overrides

### Core Functions

#### route(route, opts?)
Wraps a base route model with client-specific functionality.

```typescript
const route: (route: CommonRouteModel, opts?: ClientRouteOptions) => ClientRouteModel
```

**Parameters:**
- `route: CommonRouteModel` - Base route model from `@owlmeans/route`
- `opts?: ClientRouteOptions` - Optional configuration options

**Returns:** `ClientRouteModel` - Client route model with enhanced functionality

**Features:**
- Preserves original path as `partialPath`
- Adds promise-based resolution tracking
- Provides client-specific resolution logic
- Supports parameter overrides

**Example:**
```typescript
import { route as baseRoute } from '@owlmeans/route'
import { route as clientRoute } from '@owlmeans/client-route'

// Create a base route
const userRoute = baseRoute('user', '/users/:id')

// Wrap with client functionality
const clientUserRoute = clientRoute(userRoute, {
  overrides: {
    secure: true
  }
})

// Use client-specific features
console.log(clientUserRoute.route.partialPath) // '/users/:id'
const resolved = await clientUserRoute.resolve(context)
```

### Helper Functions

#### isClientRouteModel(route)
Type guard to check if a route object is a client route model.

```typescript
const isClientRouteModel: (route: Object) => route is ClientRouteModel
```

**Parameters:**
- `route: Object` - Object to check

**Returns:** `boolean` - True if the object is a client route model

**Example:**
```typescript
import { isClientRouteModel } from '@owlmeans/client-route'

if (isClientRouteModel(routeObject)) {
  // TypeScript knows this is a ClientRouteModel
  console.log(routeObject.route.partialPath)
}
```

#### extractParams(path)
Extracts parameter names from a route path.

```typescript
const extractParams: (path: string) => string[]
```

**Parameters:**
- `path: string` - Route path pattern

**Returns:** `string[]` - Array of parameter names

**Example:**
```typescript
import { extractParams } from '@owlmeans/client-route'

const params = extractParams('/users/:id/posts/:postId')
console.log(params) // ['id', 'postId']

const simpleParams = extractParams('/api/users/:userId')
console.log(simpleParams) // ['userId']

const noParams = extractParams('/api/users')
console.log(noParams) // []
```

## Usage Examples

### Basic Client Route Creation

```typescript
import { route as baseRoute } from '@owlmeans/route'
import { route as clientRoute } from '@owlmeans/client-route'

// Create a base route
const apiRoute = baseRoute('api', '/api/users/:id')

// Wrap with client functionality
const clientApiRoute = clientRoute(apiRoute)

// Access client-specific features
console.log(clientApiRoute.route.partialPath) // '/api/users/:id'
console.log(clientApiRoute._client) // true
```

### Route Resolution with State Tracking

```typescript
import { route as baseRoute } from '@owlmeans/route'
import { route as clientRoute } from '@owlmeans/client-route'

const userRoute = baseRoute('user', '/users/:id')
const clientUserRoute = clientRoute(userRoute)

// Resolve the route
const resolved = await clientUserRoute.resolve(context)

// The partial path is preserved
console.log(resolved.partialPath) // '/users/:id'
console.log(resolved.path) // '/users/123' (resolved)
```

### Parameter Extraction

```typescript
import { extractParams } from '@owlmeans/client-route'

// Extract parameters from different path patterns
const userParams = extractParams('/users/:id')
console.log(userParams) // ['id']

const nestedParams = extractParams('/users/:userId/posts/:postId/comments/:commentId')
console.log(nestedParams) // ['userId', 'postId', 'commentId']

// Handle paths with no parameters
const staticParams = extractParams('/api/health')
console.log(staticParams) // []
```

### Type Guards and Validation

```typescript
import { isClientRouteModel } from '@owlmeans/client-route'
import { route as baseRoute } from '@owlmeans/route'
import { route as clientRoute } from '@owlmeans/client-route'

const baseRouteModel = baseRoute('api', '/api')
const clientRouteModel = clientRoute(baseRouteModel)

console.log(isClientRouteModel(baseRouteModel)) // false
console.log(isClientRouteModel(clientRouteModel)) // true

// Type-safe access
if (isClientRouteModel(someRoute)) {
  console.log(someRoute.route.partialPath) // TypeScript knows this exists
}
```

### Route Overrides

```typescript
import { route as baseRoute } from '@owlmeans/route'
import { route as clientRoute } from '@owlmeans/client-route'

const baseUserRoute = baseRoute('user', '/users/:id')

// Override route properties
const clientUserRoute = clientRoute(baseUserRoute, {
  overrides: {
    secure: true,
    method: RouteMethod.GET
  }
})

console.log(clientUserRoute.route.secure) // true
console.log(clientUserRoute.route.partialPath) // '/users/:id'
```

## Integration with OwlMeans Context

The client-route package integrates seamlessly with the OwlMeans context system and works in conjunction with other OwlMeans Common modules:

```typescript
import { route as baseRoute, frontend } from '@owlmeans/route'
import { route as clientRoute } from '@owlmeans/client-route'
import { makeClientContext } from '@owlmeans/client-context'

// Create a frontend route
const homeRoute = baseRoute('home', '/', frontend())

// Wrap with client functionality
const clientHomeRoute = clientRoute(homeRoute)

// Use with client context
const context = makeClientContext(config)
const resolved = await clientHomeRoute.resolve(context)
```

## Advanced Usage

### Custom Resolution Logic

```typescript
import { route as baseRoute } from '@owlmeans/route'
import { route as clientRoute } from '@owlmeans/client-route'

const baseRoute = baseRoute('api', '/api/:version')
const clientApiRoute = clientRoute(baseRoute)

// The client route preserves the original path pattern
const resolved = await clientApiRoute.resolve(context)

// Use partial path for client-side routing
const navigationPath = clientApiRoute.route.partialPath
const resolvedPath = resolved.path

console.log(navigationPath) // '/api/:version' (for client routing)
console.log(resolvedPath) // '/api/v1' (resolved for actual requests)
```

### Parameter-Based Navigation

```typescript
import { extractParams } from '@owlmeans/client-route'

const buildNavigationUrl = (pathPattern: string, params: Record<string, string>) => {
  const paramNames = extractParams(pathPattern)
  let url = pathPattern
  
  paramNames.forEach(param => {
    url = url.replace(`:${param}`, params[param] || '')
  })
  
  return url
}

// Usage
const pattern = '/users/:userId/posts/:postId'
const url = buildNavigationUrl(pattern, { userId: '123', postId: '456' })
console.log(url) // '/users/123/posts/456'
```

## Error Handling

The package provides comprehensive error handling:

- **SyntaxError** - Thrown when attempting to resolve a route that's already resolved without proper promise handling
- **Type Guards** - Use `isClientRouteModel` to ensure type safety
- **Promise Management** - The `_resolved` promise prevents multiple resolution attempts

## Best Practices

1. **Use Type Guards** - Always use `isClientRouteModel` when working with mixed route types
2. **Handle Promises** - Properly handle the `_resolved` promise to avoid resolution conflicts
3. **Preserve Partial Paths** - Use the `partialPath` property for client-side routing logic
4. **Parameter Extraction** - Use `extractParams` for dynamic route handling
5. **Integration** - Combine with other OwlMeans Common modules for full functionality

## Related Modules

- **@owlmeans/route** - Base routing functionality (required dependency)
- **@owlmeans/client-context** - Client-side context management (required dependency)
- **@owlmeans/context** - Core context system for route resolution
- **@owlmeans/server-route** - Server-side route implementations

## Migration from @owlmeans/route

If you're upgrading from using `@owlmeans/route` directly in a client application:

```typescript
// Before
import { route } from '@owlmeans/route'
const userRoute = route('user', '/users/:id')

// After
import { route as baseRoute } from '@owlmeans/route'
import { route as clientRoute } from '@owlmeans/client-route'
const userRoute = clientRoute(baseRoute('user', '/users/:id'))

// Additional client functionality is now available
console.log(userRoute.route.partialPath) // '/users/:id'
```