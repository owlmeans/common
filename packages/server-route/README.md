# @owlmeans/server-route

Server-side routing extension for OwlMeans Common applications. This package extends the base `@owlmeans/route` package with server-specific functionality including request matching, path resolution, intermediate routing, and internal service routing capabilities.

## Overview

The `@owlmeans/server-route` package provides server-side routing enhancements for the OwlMeans ecosystem. It extends the core routing system with:

- **Request Matching**: Advanced pattern matching for incoming HTTP requests
- **Intermediate Routing**: Support for middleware-style routing that can partially match paths
- **Internal Service Routing**: Special handling for internal service communication
- **Path Parameter Extraction**: Automatic extraction of URL parameters from matched routes
- **Server Route Models**: Enhanced route models with server-specific capabilities
- **Wildcard Support**: Flexible wildcard matching for catch-all routes

This package is part of the OwlMeans "quadra" pattern as a server-side implementation, working alongside `@owlmeans/route`, `@owlmeans/client-route`, and other routing packages.

## Installation

```bash
npm install @owlmeans/server-route
```

## Dependencies

This package extends and requires:
- `@owlmeans/route`: Core routing functionality
- `@owlmeans/context`: Context management system

## Core Concepts

### Server Route Model

Server route models extend the base route functionality with server-specific features like request matching and intermediate route detection.

### Intermediate Routes

Intermediate routes can partially match request paths, making them useful for middleware functionality that should be applied to multiple endpoints.

### Internal Routing

Support for internal service communication with special host and port handling for services that operate behind proxies or in containerized environments.

### Path Matching

Advanced path matching that supports parameters (`:id`), wildcards (`*`), and partial matching for intermediate routes.

## API Reference

### Types

#### `ServerRoute`
Server-specific route interface that extends CommonRoute with server extras.

```typescript
interface ServerRoute extends CommonRoute, ServerRouteExtras {}
```

#### `ServiceRoute`
Server-specific service route interface.

```typescript
interface ServiceRoute extends CommonServiceRoute, ServerRouteExtras {}
```

#### `ServerRouteExtras`
Additional properties for server routes.

```typescript
interface ServerRouteExtras {
  internalHost?: string   // Internal service host (e.g., for containers)
  internalPort?: number   // Internal service port
  opened?: boolean        // Whether service is open to external connections
}
```

#### `ServerRouteModel<R>`
Enhanced route model with server-specific capabilities.

```typescript
interface ServerRouteModel<R> extends CommonRouteModel {
  route: ServerRoute
  match<Request extends R>(request: Request): boolean
  isIntermediate(): boolean
}
```

**Methods:**
- **`match<Request>(request: Request): boolean`**: Matches incoming request against route pattern
- **`isIntermediate(): boolean`**: Returns true if route is configured for intermediate matching

#### `ServerRouteOptions<R>`
Configuration options for server routes.

```typescript
interface ServerRouteOptions<R> {
  overrides?: Partial<ServerRoute>                              // Route property overrides
  pathField?: string                                            // Field name containing request path (default: 'url')
  match?<Request extends R>(request: Request): boolean          // Custom matching function
}
```

### Factory Functions

#### `route<R>(route: CommonRouteModel, intermediate: boolean, opts?: ServerRouteOptions<R>): ServerRouteModel<R>`

Creates a server route model from a common route model.

**Parameters:**
- `route`: CommonRouteModel - Base route to extend
- `intermediate`: boolean - Whether route supports intermediate matching
- `opts`: ServerRouteOptions - Optional configuration

**Returns:** ServerRouteModel instance with server-specific capabilities

**Example:**
```typescript
import { route } from '@owlmeans/server-route'
import { route as baseRoute, backend } from '@owlmeans/route'

// Create base route
const apiRoute = baseRoute('api', '/api', backend())

// Create server route for exact matching
const exactRoute = route(apiRoute, false)

// Create intermediate route for middleware
const middlewareRoute = route(apiRoute, true, {
  pathField: 'originalUrl',
  overrides: { path: '/api/*' }
})
```

### Helper Functions

#### `isServerRouteModel<R>(route: Object): route is ServerRouteModel<R>`

Type guard to determine if an object is a server route model.

**Parameters:**
- `route`: Object to check

**Returns:** Boolean indicating if object is a ServerRouteModel

**Example:**
```typescript
import { isServerRouteModel } from '@owlmeans/server-route'

if (isServerRouteModel(someRoute)) {
  // TypeScript knows someRoute is ServerRouteModel
  const canMatch = someRoute.match(request)
  const isMiddleware = someRoute.isIntermediate()
}
```

### Utility Functions

#### `matchToPathes(template: string, path: string): MatchResult`

Matches a path against a route template with parameter extraction.

```typescript
interface MatchResult {
  params: Record<string, string>   // Extracted parameters
  match: boolean                   // True if path matches template
  partial: boolean                 // True if path partially matches (for intermediate routes)
}
```

**Parameters:**
- `template`: Route template with parameters and wildcards
- `path`: Request path to match

**Returns:** MatchResult with matching information and extracted parameters

**Example:**
```typescript
import { matchToPathes } from '@owlmeans/server-route/utils'

// Exact match
const result1 = matchToPathes('/api/users/:id', '/api/users/123')
// { params: { id: '123' }, match: true, partial: false }

// Partial match with wildcard
const result2 = matchToPathes('/api/*', '/api/users/123')
// { params: {}, match: true, partial: false }

// Intermediate match
const result3 = matchToPathes('/api/users/:id/profile', '/api/users/123')
// { params: { id: '123' }, match: false, partial: true }
```

### Constants

#### Route Matching
```typescript
const DEFAULT_FIELD = 'url'      // Default field for request path
const WILDCARD = '*'             // Wildcard character for matching
```

## Usage Examples

### Basic Server Route Creation

```typescript
import { route } from '@owlmeans/server-route'
import { route as baseRoute, backend, RouteMethod } from '@owlmeans/route'

// Create base routes
const usersRoute = baseRoute('users', '/api/users', backend(null, RouteMethod.GET))
const userRoute = baseRoute('user', '/api/users/:id', backend(null, RouteMethod.GET))

// Create server routes
const serverUsersRoute = route(usersRoute, false)
const serverUserRoute = route(userRoute, false)

// Test route matching
const request = { url: '/api/users/123' }
console.log(serverUsersRoute.match(request))  // false
console.log(serverUserRoute.match(request))   // true
```

### Intermediate Routes for Middleware

```typescript
import { route } from '@owlmeans/server-route'
import { route as baseRoute, backend } from '@owlmeans/route'

// Create middleware route that matches all API paths
const authMiddleware = baseRoute('auth', '/api', backend())
const serverAuthRoute = route(authMiddleware, true, {
  overrides: { path: '/api/*' }
})

// This route will match any path starting with /api
const requests = [
  { url: '/api/users' },
  { url: '/api/users/123' },
  { url: '/api/posts/456' }
]

requests.forEach(req => {
  console.log(serverAuthRoute.match(req))  // true for all
})
```

### Custom Request Matching

```typescript
import { route } from '@owlmeans/server-route'

// Custom matcher for specific request types
const customRoute = route(baseRoute, false, {
  pathField: 'originalUrl',
  match: (request) => {
    return request.method === 'POST' && 
           request.headers['content-type'] === 'application/json'
  }
})
```

### Internal Service Configuration

```typescript
import { makeServerContext } from '@owlmeans/server-context'

const context = makeServerContext({
  service: 'api-service',
  services: {
    'api-service': {
      host: 'api.example.com',
      port: 443,
      internalHost: 'api-internal',  // Internal container host
      internalPort: 8080,            // Internal container port
      opened: false                  // Not open to external connections
    }
  }
})

// Routes will automatically use internal settings for service communication
const internalRoute = route(apiRoute, false)
await internalRoute.resolve(context)

console.log(internalRoute.route.host)         // 'api-internal'
console.log(internalRoute.route.port)         // 8080
console.log(internalRoute.route.secure)       // false (internal)
```

### Parameter Extraction

```typescript
import { matchToPathes } from '@owlmeans/server-route/utils'

// Extract parameters from complex paths
const template = '/api/users/:userId/posts/:postId'
const path = '/api/users/123/posts/456'

const result = matchToPathes(template, path)
console.log(result.params)  // { userId: '123', postId: '456' }
console.log(result.match)   // true
```

### Wildcard Matching

```typescript
// Catch-all route for file serving
const staticTemplate = '/static/*'
const paths = [
  '/static/css/app.css',
  '/static/js/bundle.js',
  '/static/images/logo.png'
]

paths.forEach(path => {
  const result = matchToPathes(staticTemplate, path)
  console.log(`${path}: ${result.match}`)  // All true
})
```

### Complex Route Hierarchies

```typescript
import { route } from '@owlmeans/server-route'

// API versioning with parameters
const v1Route = route(
  baseRoute('api-v1', '/api/v1', backend()), 
  true,  // Intermediate for middleware
  { overrides: { path: '/api/v1/*' } }
)

const usersV1Route = route(
  baseRoute('users-v1', '/api/v1/users/:id', backend()),
  false
)

// These routes work together in a hierarchy
const request = { url: '/api/v1/users/123' }
console.log(v1Route.match(request))      // true (partial/intermediate)
console.log(usersV1Route.match(request)) // true (exact)
```

### Route Resolution with Context

```typescript
import { route } from '@owlmeans/server-route'

// Create route that needs resolution
const dynamicRoute = route(
  baseRoute('dynamic', '/api/:version/data', backend()),
  false,
  {
    overrides: {
      service: 'data-service'
    }
  }
)

// Resolve route with context
await dynamicRoute.resolve(context)

// Now route has resolved host, port, and other service settings
console.log(dynamicRoute.route.resolved)  // true
console.log(dynamicRoute.route.host)      // Resolved from service config
```

## Advanced Features

### Request Field Customization

Different server frameworks may use different field names for the request path:

```typescript
// Express.js style
const expressRoute = route(baseRoute, false, {
  pathField: 'originalUrl'
})

// Fastify style (default)
const fastifyRoute = route(baseRoute, false, {
  pathField: 'url'
})

// Custom field
const customRoute = route(baseRoute, false, {
  pathField: 'routePath'
})
```

### Middleware Chain Routing

Intermediate routes are designed to work in middleware chains:

```typescript
// Authentication middleware
const authRoute = route(authBase, true, {
  overrides: { path: '/api/*' }
})

// Logging middleware  
const logRoute = route(logBase, true, {
  overrides: { path: '/*' }
})

// These can be processed in order for any matching request
const middlewares = [logRoute, authRoute]
const request = { url: '/api/users/123' }

middlewares.forEach((middleware, index) => {
  if (middleware.match(request)) {
    console.log(`Middleware ${index} matches`)
  }
})
```

### Service Discovery Integration

Routes can resolve service locations dynamically:

```typescript
// Service might be discovered via consul, k8s, etc.
const context = makeServerContext({
  services: {
    'user-service': {
      host: 'user-service.default.svc.cluster.local',
      port: 80,
      internalHost: 'user-service',
      internalPort: 3000
    }
  }
})

const userServiceRoute = route(
  baseRoute('users', '/users', backend('user-service')),
  false
)

await userServiceRoute.resolve(context)
// Route now configured for internal k8s communication
```

## Error Handling

### Route Resolution Errors

```typescript
try {
  await serverRoute.resolve(context)
} catch (error) {
  if (error instanceof SyntaxError) {
    console.error('Route resolution failed:', error.message)
  }
}
```

### Matching Errors

```typescript
try {
  const matches = serverRoute.match(request)
} catch (error) {
  if (error.message.includes('Route not resolved')) {
    console.error('Route must be resolved before matching')
    await serverRoute.resolve(context)
  }
}
```

## Integration with OwlMeans Ecosystem

### Server Module Integration

```typescript
import { createServerModule } from '@owlmeans/server-module'
import { route } from '@owlmeans/server-route'

const serverRoute = route(baseRoute, false)
const serverModule = createServerModule(serverRoute, {
  handle: async (req, res) => {
    // Module handler
  }
})
```

### API Server Integration

```typescript
import { createApiServer } from '@owlmeans/server-api'

// Server routes are automatically processed by API server
const apiServer = createApiServer('main')
context.registerService(apiServer)

// Routes registered as modules are matched and handled
context.registerModule(serverModule)
```

### Client Route Consistency

```typescript
// Same base route used on client and server
import { route as baseRoute } from '@owlmeans/route'
import { route as serverRoute } from '@owlmeans/server-route'
import { route as clientRoute } from '@owlmeans/client-route'

const apiRoute = baseRoute('api', '/api/users/:id', backend())

// Server-side processing
const server = serverRoute(apiRoute, false)

// Client-side processing  
const client = clientRoute(apiRoute)

// Both work with the same base route definition
```

## Performance Considerations

- **Route Caching**: Resolved routes are cached to avoid repeated resolution
- **Match Optimization**: Path matching uses efficient string operations
- **Parameter Extraction**: Parameter parsing is done during matching for efficiency
- **Intermediate Matching**: Partial matching is optimized for middleware scenarios

## Best Practices

1. **Route Resolution**: Always resolve routes before using match functionality
2. **Intermediate Routes**: Use intermediate routes for middleware that applies to multiple endpoints
3. **Service Configuration**: Properly configure internal hosts for containerized deployments
4. **Path Templates**: Use consistent parameter naming across related routes
5. **Wildcard Usage**: Use wildcards sparingly and place them at appropriate positions
6. **Error Handling**: Handle route resolution and matching errors appropriately

## Related Packages

- [`@owlmeans/route`](../route) - Core routing functionality
- [`@owlmeans/client-route`](../client-route) - Client-side routing extensions
- [`@owlmeans/server-module`](../server-module) - Server module system
- [`@owlmeans/server-api`](../server-api) - Server API framework
- [`@owlmeans/context`](../context) - Context management system