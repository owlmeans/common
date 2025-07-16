# @owlmeans/route

Cross-environment routing library for OwlMeans applications that provides structures for URLs, URIs, aliases, permissions, and validations.

## Overview

The `@owlmeans/route` module is a core component of the OwlMeans Common library suite that provides routing functionality as part of the OwlMeans Common Module approach (described in `@owlmeans/context`). This module is not self-sufficient and is designed to work within the OwlMeans Common Module ecosystem.

Key features:

- **Routes** - Cross-environment structures consisting of URLs, URIs, aliases, permissions, and validations (POJO)
- **Route Models** - Wrapper objects that add behavior to route POJOs with resolution capabilities
- **Service Routes** - Routes that define service endpoints and configurations
- **Resolution Logic** - Context-aware route resolution with parent-child relationships
- **Helper Functions** - Utilities for creating, manipulating, and working with routes

## Core Concepts

### Route
A route is a cross-environment structure that defines how to access a particular endpoint or resource. It includes:
- **Alias** - Unique identifier for the route
- **Path** - URL path pattern
- **Parent** - Optional parent route for hierarchical structures
- **Method** - HTTP method (GET, POST, PUT, PATCH)
- **Protocol** - Communication protocol (HTTP, WebSocket)
- **Security** - Whether the route requires secure connections

### Route Model
A route model wraps a route POJO with additional behavior, particularly the ability to resolve the route within a given context.

### Service Route
A service route is an object that describes the base URL of a service (host, port, and other connection details). It differs from a regular route object, which describes a specific URL within a service.

## Installation

```bash
npm install @owlmeans/route
```

## API Reference

### Types

#### CommonRoute
Main route interface that extends BasicRoute with additional properties.

```typescript
interface CommonRoute extends BasicRoute {
  alias: string          // Unique identifier for the route
  path: string          // URL path pattern
  parent?: string       // Optional parent route alias
  default?: boolean     // Whether this is a default route
  method?: RouteMethod  // HTTP method
  protocol?: RouteProtocols // Communication protocol
  secure?: boolean      // Whether secure connection is required
}
```

#### CommonServiceRoute
Service route interface that describes the base URL of a service.

```typescript
interface CommonServiceRoute extends BasicRoute {
  home?: string         // Home path for the service
  service: string       // Service identifier
  default?: boolean     // Whether this is a default service
}
```

**Note:** A service route describes the base URL of a service (such as host and port), while a regular route describes a specific URL within that service.

#### BasicRoute
Base route interface with common properties.

```typescript
interface BasicRoute {
  type: AppType         // Application type (Backend/Frontend)
  service?: string      // Service identifier
  host?: string         // Host address
  port?: number         // Port number
  base?: string         // Base path
  resolved: boolean     // Whether route is resolved
}
```

#### CommonRouteModel
Route model that wraps a route with resolution capabilities.

```typescript
interface CommonRouteModel {
  route: CommonRoute    // The wrapped route
  resolve: <C extends BasicConfig, T extends BasicContext<C>>(context: T) => Promise<CommonRoute>
}
```

#### RouteOptions
Partial CommonRoute options for route creation.

```typescript
interface RouteOptions extends Partial<CommonRoute> {
}
```

### Constants

#### RouteMethod
Enumeration of supported HTTP methods.

```typescript
enum RouteMethod {
  GET = 'get',
  POST = 'post',
  PATCH = 'patch',
  PUT = 'put'
}
```

#### RouteProtocols
Enumeration of supported communication protocols.

```typescript
enum RouteProtocols {
  WEB = 'http',
  SOCKET = 'ws'
}
```

#### SEP
Path separator constant.

```typescript
const SEP = '/'
```

#### PARAM
Parameter prefix constant.

```typescript
const PARAM = ':'
```

### Core Functions

#### route(alias, path, opts?)
Creates a route model from the given parameters.

```typescript
const route: CreateRouteSignature<CommonRouteModel> = (alias, path, opts?) => CommonRouteModel
```

**Parameters:**
- `alias: string` - Unique identifier for the route
- `path: string` - URL path pattern
- `opts?: RouteOptions | string` - Route options or parent route alias

**Returns:** `CommonRouteModel` - Route model with resolve capability

**Example:**
```typescript
const userRoute = route('user', '/api/users/:id', {
  method: RouteMethod.GET,
  protocol: RouteProtocols.WEB
})
```

#### createRoute(alias, path, opts?)
Creates a route POJO without wrapping it in a model.

```typescript
const createRoute: CreateRouteSignature<CommonRoute> = (alias, path, opts?) => CommonRoute
```

**Parameters:**
- `alias: string` - Unique identifier for the route
- `path: string` - URL path pattern  
- `opts?: RouteOptions | string` - Route options or parent route alias

**Returns:** `CommonRoute` - Route POJO

**Example:**
```typescript
const apiRoute = createRoute('api', '/api', {
  type: AppType.Backend,
  secure: true
})
```

#### makeRouteModel(route)
Creates a route model from a route POJO.

```typescript
const makeRouteModel = (route: CommonRoute): CommonRouteModel
```

**Parameters:**
- `route: CommonRoute` - Route POJO to wrap

**Returns:** `CommonRouteModel` - Route model with resolve capability

### Helper Functions

#### normalizePath(path)
Normalizes a URL path by removing leading/trailing slashes and trimming whitespace.

```typescript
const normalizePath = (path: string): string
```

**Parameters:**
- `path: string` - Path to normalize

**Returns:** `string` - Normalized path

**Example:**
```typescript
normalizePath('/api/users/') // Returns 'api/users'
normalizePath('  /api/  ') // Returns 'api'
```

#### rtype(type, opts?)
Creates route options with a specific application type.

```typescript
const rtype = (type: AppType, opts?: RouteOptions | string): Partial<RouteOptions>
```

**Parameters:**
- `type: AppType` - Application type (Backend/Frontend)
- `opts?: RouteOptions | string` - Additional options or parent route alias

**Returns:** `Partial<RouteOptions>` - Route options with type set

#### backend(opts?, method?)
Creates route options configured for backend routes.

```typescript
const backend = (opts?: RouteOptions | string | null, method?: RouteOptions | RouteMethod): Partial<RouteOptions>
```

**Parameters:**
- `opts?: RouteOptions | string | null` - Route options or parent route alias
- `method?: RouteOptions | RouteMethod` - HTTP method or additional options

**Returns:** `Partial<RouteOptions>` - Backend route options

**Example:**
```typescript
const backendRoute = route('api', '/api', backend(null, RouteMethod.GET))
```

#### frontend(opts?, def?)
Creates route options configured for frontend routes.

```typescript
const frontend = (opts?: RouteOptions | string | null, def?: RouteOptions | boolean): Partial<RouteOptions>
```

**Parameters:**
- `opts?: RouteOptions | string | null` - Route options or parent route alias
- `def?: RouteOptions | boolean` - Default flag or additional options

**Returns:** `Partial<RouteOptions>` - Frontend route options

**Example:**
```typescript
const frontendRoute = route('home', '/', frontend(null, true))
```

#### service(service, opts?)
Creates route options with a specific service identifier.

```typescript
const service = (service: string, opts?: Partial<RouteOptions>): Partial<RouteOptions>
```

**Parameters:**
- `service: string` - Service identifier
- `opts?: Partial<RouteOptions>` - Additional route options

**Returns:** `Partial<RouteOptions>` - Route options with service set

#### socket(opts?, secondary?)
Creates route options configured for WebSocket routes.

```typescript
const socket = (opts?: RouteOptions | string | null, secondary?: RouteOptions): Partial<RouteOptions>
```

**Parameters:**
- `opts?: RouteOptions | string | null` - Route options or parent route alias
- `secondary?: RouteOptions` - Additional options

**Returns:** `Partial<RouteOptions>` - WebSocket route options

**Example:**
```typescript
const socketRoute = route('ws', '/socket', socket())
```

### Utility Functions

#### resolve(route)
Creates a route resolution function that resolves the route within a given context.

```typescript
const resolve = <C extends Config, T extends BasicContext<C>>(route: CommonRoute) => (context: T) => Promise<CommonRoute>
```

**Parameters:**
- `route: CommonRoute` - Route to resolve

**Returns:** `(context: T) => Promise<CommonRoute>` - Resolution function

**Features:**
- Resolves parent routes recursively
- Handles service route resolution
- Manages path concatenation
- Applies security settings
- Detects circular dependencies

#### getParentRoute(context, route)
Retrieves and resolves the parent route for a given route.

```typescript
const getParentRoute = async <C extends Config, T extends BasicContext<C>>(context: T, route: CommonRoute): Promise<CommonRoute | null>
```

**Parameters:**
- `context: T` - Application context
- `route: CommonRoute` - Route to find parent for

**Returns:** `Promise<CommonRoute | null>` - Parent route or null if no parent

#### overrideParams(route, overrides, filter?)
Overrides route parameters with provided values.

```typescript
const overrideParams = (route: CommonRoute, overrides?: Partial<CommonRoute>, filter?: string[]) => void
```

**Parameters:**
- `route: CommonRoute` - Route to modify
- `overrides?: Partial<CommonRoute>` - Parameters to override
- `filter?: string[]` - Optional filter for which parameters to override

#### prependBase(route)
Prepends the base path to a route's path.

```typescript
const prependBase = (route: CommonRoute) => string
```

**Parameters:**
- `route: CommonRoute` - Route to process

**Returns:** `string` - Path with base prepended

#### isServiceRoute(obj)
Type guard to check if an object is a service route.

```typescript
const isServiceRoute = (obj?: Object): obj is CommonServiceRoute
```

**Parameters:**
- `obj?: Object` - Object to check

**Returns:** `boolean` - True if object is a service route

#### isServiceRouteResolved(route)
Type guard to check if a service route is resolved.

```typescript
const isServiceRouteResolved = (route: CommonServiceRoute): route is ResolvedServiceRoute
```

**Parameters:**
- `route: CommonServiceRoute` - Service route to check

**Returns:** `boolean` - True if service route is resolved

## Usage Examples

### Basic Route Creation

```typescript
import { route, RouteMethod, RouteProtocols } from '@owlmeans/route'

// Create a simple API route
const userRoute = route('user', '/api/users/:id', {
  method: RouteMethod.GET,
  protocol: RouteProtocols.WEB
})

// Create a nested route with parent
const userProfileRoute = route('userProfile', '/profile', 'user')
```

### Backend Route Configuration

```typescript
import { route, backend, RouteMethod } from '@owlmeans/route'

// Create a backend API route
const apiRoute = route('api', '/api', backend())

// Create a POST endpoint
const createUserRoute = route('createUser', '/users', backend('api', RouteMethod.POST))
```

### Frontend Route Configuration

```typescript
import { route, frontend } from '@owlmeans/route'

// Create a default frontend route
const homeRoute = route('home', '/', frontend(null, true))

// Create a nested frontend route
const aboutRoute = route('about', '/about', frontend())
```

### WebSocket Route Configuration

```typescript
import { route, socket } from '@owlmeans/route'

// Create a WebSocket route
const chatRoute = route('chat', '/chat', socket())
```

### Route Resolution

```typescript
import { route, backend } from '@owlmeans/route'

// Create a route that needs resolution
const apiRoute = route('api', '/api', backend())

// Resolve the route with context
const resolvedRoute = await apiRoute.resolve(context)
console.log(resolvedRoute.host) // Resolved host
console.log(resolvedRoute.port) // Resolved port
```

### Service Route Usage

```typescript
import { route, service, backend } from '@owlmeans/route'

// Create a route with service configuration
const userServiceRoute = route('userService', '/users', {
  ...backend(),
  ...service('user-service')
})
```

## Integration with OwlMeans Context

The route module is part of the OwlMeans Common Module approach and integrates seamlessly with the OwlMeans context system (see `@owlmeans/context` for more details on the Common Module approach). This module is not self-sufficient and requires the context system to function properly:

```typescript
import { route, backend } from '@owlmeans/route'
import { BasicContext } from '@owlmeans/context'

// Create a route
const apiRoute = route('api', '/api', backend())

// Resolve within context
const resolvedRoute = await apiRoute.resolve(context)

// Use in module
const module = {
  _module: true,
  route: apiRoute,
  resolve: async () => {
    await apiRoute.resolve(context)
  }
}
```

## Error Handling

The module provides comprehensive error handling:

- **SyntaxError** - Thrown for configuration errors, missing services, or circular dependencies
- **Type Guards** - Used to ensure type safety when working with service routes
- **Validation** - Route parameters are validated during resolution

## Best Practices

1. **Use Aliases** - Always provide meaningful aliases for routes
2. **Hierarchical Structure** - Organize routes in a parent-child hierarchy when appropriate
3. **Service Configuration** - Configure services properly in the context for route resolution
4. **Security** - Set appropriate security flags for routes
5. **Type Safety** - Use TypeScript interfaces and type guards for better development experience

## Related Modules

- `@owlmeans/context` - Provides the context system for route resolution
- `@owlmeans/client-route` - Client-side route implementations
- `@owlmeans/server-route` - Server-side route implementations