# @owlmeans/server-api

Server-side API framework for OwlMeans Common applications. This package provides a comprehensive HTTP server implementation built on Fastify, with seamless integration into the OwlMeans module system, authentication, validation, and error handling.

## Overview

The `@owlmeans/server-api` package is a high-level server framework that extends the OwlMeans ecosystem with HTTP API capabilities. It provides:

- **Fastify-based HTTP Server**: High-performance HTTP server with comprehensive middleware
- **Module Integration**: Seamless integration with OwlMeans modules for route handling  
- **Authentication & Authorization**: Built-in support for authentication guards and gates
- **Request/Response Handling**: Structured request/response processing with validation
- **File Upload Support**: Multipart file upload handling with configurable limits
- **Error Management**: Comprehensive error handling with resilient error system
- **Security Features**: CORS, Helmet, and security middleware integration
- **Context Propagation**: Request-scoped context management throughout the request lifecycle

This package is part of the OwlMeans "quadra" pattern as a server-side implementation, complementing client-side packages and providing the backend foundation for fullstack applications.

## Installation

```bash
npm install @owlmeans/server-api
```

## Dependencies

This package requires and integrates with:
- `@owlmeans/server-context`: Server context management
- `@owlmeans/server-module`: Server-side module system
- `@owlmeans/auth-common`: Authentication middleware
- `@owlmeans/module`: Core module system
- `@owlmeans/route`: Routing infrastructure
- `@owlmeans/api`: API utilities and constants
- `fastify`: High-performance HTTP server

## Core Concepts

### API Server Service

The API server is implemented as an OwlMeans service that manages a Fastify instance, handles module registration, and provides lifecycle management.

### Module-based Routing

Routes are defined through OwlMeans modules, which are automatically registered with the Fastify server and processed according to their configuration.

### Context Propagation

Each request receives a context that contains authentication information, services, and can be modified by intermediate modules throughout the request lifecycle.

### Request/Response Abstraction

The framework provides abstracted request/response objects that hide Fastify-specific details while providing access to the underlying objects when needed.

## API Reference

### Types

#### `ApiServer`
Main server service interface that manages the Fastify instance.

```typescript
interface ApiServer extends InitializedService {
  server: FastifyInstance
  layers: [Layer.System]
  listen(): Promise<void>
}
```

**Properties:**
- `server`: The underlying Fastify instance
- `layers`: Service operates at System layer

**Methods:**
- `listen(): Promise<void>`: Starts the HTTP server and listens for connections

#### `Request`
Type alias for Fastify request objects.

```typescript
interface Request extends FastifyRequest {}
```

#### `Response`  
Type alias for Fastify reply objects.

```typescript
interface Response extends FastifyReply {}
```

#### `Config`
Server configuration interface.

```typescript
interface Config extends ServerConfig {}
```

#### `Context<C extends Config>`
Server context interface with API server capabilities.

```typescript
interface Context<C extends Config = Config> extends ServerContext<C>, ApiServerAppend {}
```

#### `ApiServerAppend`
Interface for contexts that provide API server access.

```typescript
interface ApiServerAppend {
  getApiServer(): ApiServer
}
```

### Factory Functions

#### `createApiServer(alias: string): ApiServer`

Creates an API server service instance with comprehensive middleware and configuration.

**Parameters:**
- `alias`: Service alias for registration

**Returns:** ApiServer instance

**Features:**
- Fastify server with logging
- CORS support with configurable origins
- Security headers via Helmet
- File upload support with multipart
- Raw body parsing
- AJV validation with format support
- Module-based routing
- Authentication integration
- Error handling

**Example:**
```typescript
import { createApiServer } from '@owlmeans/server-api'

const apiServer = createApiServer('main-api')
```

### Helper Functions

#### `handleBody<T>(handler: (payload: T, ctx: BasicContext, req: AbstractRequest) => Promise<any>): RefedModuleHandler`

Creates a module handler that processes request body data.

**Parameters:**
- `handler`: Function that processes the request body

**Returns:** Module handler function

**Example:**
```typescript
import { handleBody } from '@owlmeans/server-api'

const createUserHandler = handleBody<CreateUserRequest>(async (payload, ctx, req) => {
  const userService = ctx.service('user')
  return await userService.create(payload)
})
```

#### `handleParams<T>(handler: (payload: T, ctx: BasicContext, req: AbstractRequest) => Promise<any>): RefedModuleHandler`

Creates a module handler that processes URL parameters.

**Parameters:**
- `handler`: Function that processes the URL parameters

**Returns:** Module handler function

**Example:**
```typescript
import { handleParams } from '@owlmeans/server-api'

const getUserHandler = handleParams<{ id: string }>(async (params, ctx) => {
  const userService = ctx.service('user')
  return await userService.get(params.id)
})
```

#### `handleRequest(handler: (req: AbstractRequest, ctx: BasicContext, res?: AbstractResponse) => Promise<any>): RefedModuleHandler`

Creates a module handler that processes the full request object.

**Parameters:**
- `handler`: Function that processes the request

**Returns:** Module handler function

**Example:**
```typescript
import { handleRequest } from '@owlmeans/server-api'

const customHandler = handleRequest(async (req, ctx, res) => {
  // Custom request processing logic
  return { message: 'Custom response' }
})
```

#### `handleIntermediate(handler: (req: AbstractRequest, ctx: BasicContext) => Promise<BasicContext | null>): RefedModuleHandler`

Creates an intermediate module handler that can modify the request context.

**Parameters:**
- `handler`: Function that processes request and potentially modifies context

**Returns:** Module handler function

**Example:**
```typescript
import { handleIntermediate } from '@owlmeans/server-api'

const authMiddleware = handleIntermediate(async (req, ctx) => {
  // Add authentication data to context
  const modifiedContext = await addAuthToContext(ctx, req)
  return modifiedContext
})
```

#### `extractUploadedFile(req: AbstractRequest): Promise<UploadedFile | undefined>`

Extracts an uploaded file from a multipart request.

**Parameters:**
- `req`: Abstract request object

**Returns:** Promise resolving to uploaded file or undefined

**Example:**
```typescript
import { extractUploadedFile } from '@owlmeans/server-api'

const uploadHandler = handleRequest(async (req, ctx) => {
  const file = await extractUploadedFile(req)
  if (file) {
    // Process uploaded file
    return { filename: file.filename, size: file.file.bytesRead }
  }
  throw new NoFileError()
})
```

### Error Types

The package provides comprehensive error classes for API-specific failures:

#### `AuthFailedError`
Error for authentication failures.

```typescript
class AuthFailedError extends ApiError {
  constructor(message: string = 'error')
}
```

#### `AccessError`  
Error for authorization/access failures.

```typescript
class AccessError extends ApiError {
  constructor(message: string = 'error')
}
```

#### `NoFileError`
Error when an expected file upload is missing.

```typescript
class NoFileError extends ApiError {
  constructor()
}
```

### Constants

#### Server Configuration
```typescript
const DEFAULT_ALIAS = 'api-server'    // Default service alias
const PORT = 80                       // Default HTTP port
const CLOSED_HOST = '127.0.0.1'      // Localhost binding
const OPENED_HOST = '0.0.0.0'        // Open binding for external access
```

### Utility Functions

Available in the `/utils` subpackage:

#### Request/Response Utilities
- `provideRequest(alias, req, provision?)`: Creates AbstractRequest from Fastify request
- `executeResponse(response, reply, throwOnError?)`: Executes AbstractResponse with Fastify reply

#### Server Utilities
- `canServeModule(context, module)`: Determines if a module can be served by the API server
- `createServerHandler(module, location)`: Creates Fastify route handler from OwlMeans module

#### Guard Utilities
- `authorize(context, module, req, reply)`: Handles authentication and authorization for modules

## Usage Examples

### Basic API Server Setup

```typescript
import { createApiServer } from '@owlmeans/server-api'
import { makeServerContext } from '@owlmeans/server-context'
import { AppType, Layer } from '@owlmeans/context'

// Create server context
const context = makeServerContext({
  service: 'my-api',
  type: AppType.Backend,
  layer: Layer.Service,
  services: {
    'my-api': {
      host: 'localhost',
      port: 3000,
      opened: true
    }
  }
})

// Create and register API server
const apiServer = createApiServer('main-api')
context.registerService(apiServer)

// Initialize and start server
await context.configure().init()
await apiServer.listen()
```

### Module-based API Endpoints

```typescript
import { module } from '@owlmeans/module'
import { route, backend, RouteMethod } from '@owlmeans/route'
import { handleBody, handleParams } from '@owlmeans/server-api'

// Create API modules
const getUserModule = module(
  route('get-user', '/api/users/:id', backend(null, RouteMethod.GET)),
  {
    handle: handleParams<{ id: string }>(async (params, ctx) => {
      const userService = ctx.service('user')
      return await userService.get(params.id)
    })
  }
)

const createUserModule = module(
  route('create-user', '/api/users', backend(null, RouteMethod.POST)),
  {
    handle: handleBody<CreateUserRequest>(async (payload, ctx) => {
      const userService = ctx.service('user')
      return await userService.create(payload)
    }),
    filter: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' }
        },
        required: ['name', 'email']
      }
    }
  }
)

// Register modules with context
context.registerModule(getUserModule)
context.registerModule(createUserModule)
```

### Authentication and Authorization

```typescript
import { guard, gate } from '@owlmeans/module'

// Protected endpoint with authentication guard
const protectedModule = module(
  route('protected', '/api/admin/users', backend(null, RouteMethod.GET)),
  {
    ...guard('auth'),           // Requires authentication
    ...gate('admin', ['users']), // Requires admin gate with users permission
    handle: handleRequest(async (req, ctx) => {
      // Only authenticated admin users can access this
      return { message: 'Admin access granted' }
    })
  }
)
```

### File Upload Handling

```typescript
import { extractUploadedFile, NoFileError } from '@owlmeans/server-api'

const uploadModule = module(
  route('upload', '/api/upload', backend(null, RouteMethod.POST)),
  {
    handle: handleRequest(async (req, ctx) => {
      const file = await extractUploadedFile(req)
      if (!file) {
        throw new NoFileError()
      }
      
      // Process the uploaded file
      const fileData = await file.toBuffer()
      
      return {
        filename: file.filename,
        size: fileData.length,
        mimetype: file.mimetype
      }
    })
  }
)
```

### Intermediate Middleware

```typescript
import { handleIntermediate } from '@owlmeans/server-api'

// Logging middleware
const loggingModule = module(
  route('logging', '/api/*'),
  {
    sticky: true,  // Apply to all routes
    handle: handleIntermediate(async (req, ctx) => {
      console.log(`${req.method} ${req.path}`)
      return ctx  // Return context unchanged
    })
  }
)

// Authentication middleware
const authModule = module(
  route('auth-middleware', '/api/auth/*'),
  {
    sticky: true,
    handle: handleIntermediate(async (req, ctx) => {
      // Extract and validate auth token
      const authToken = req.headers.authorization
      if (authToken) {
        const authService = ctx.service('auth')
        const auth = await authService.validate(authToken)
        // Add auth to request for downstream handlers
        req.auth = auth
      }
      return ctx
    })
  }
)
```

### Error Handling

```typescript
import { AuthFailedError, AccessError } from '@owlmeans/server-api'

const secureModule = module(
  route('secure', '/api/secure', backend()),
  {
    handle: handleRequest(async (req, ctx) => {
      // Check authentication
      if (!req.auth) {
        throw new AuthFailedError('Authentication required')
      }
      
      // Check authorization
      if (req.auth.role !== 'admin') {
        throw new AccessError('Admin access required')
      }
      
      return { message: 'Secure data' }
    })
  }
)
```

### Custom Server Configuration

```typescript
import { createApiServer } from '@owlmeans/server-api'

const apiServer = createApiServer('custom-api')

// Access underlying Fastify instance for custom configuration
apiServer.server.register(async (fastify) => {
  // Custom Fastify plugins or configuration
  fastify.addHook('preHandler', async (request, reply) => {
    // Custom pre-handler logic
  })
})

// Custom listen configuration
const context = makeServerContext({
  services: {
    'custom-api': {
      host: '0.0.0.0',
      port: 8080,
      opened: true,
      internalPort: 8080  // Use different internal port
    }
  }
})
```

## Advanced Features

### Context Modification

Intermediate modules can modify the request context, allowing for dynamic service injection and request preprocessing:

```typescript
const contextModifier = handleIntermediate(async (req, ctx) => {
  // Dynamically add services based on request
  if (req.headers['x-tenant-id']) {
    const tenantCtx = await createTenantContext(req.headers['x-tenant-id'])
    return tenantCtx
  }
  return ctx
})
```

### Request Lifecycle

1. **Pre-handler Hook**: Processes intermediate modules in order
2. **Authentication**: Validates authentication guards
3. **Authorization**: Checks authorization gates  
4. **Validation**: Validates request schema (body, params, query)
5. **Handler Execution**: Executes module handler
6. **Response Processing**: Formats and sends response

### Server Configuration

The server automatically configures based on context service settings:

- `host`: Server host binding
- `port`: Server port
- `internalPort`: Alternative port for internal binding
- `opened`: Whether to bind to external interfaces (0.0.0.0) or localhost only

## Integration with OwlMeans Ecosystem

### Module Integration

```typescript
import { modules } from '@owlmeans/server-module'

// Server modules are automatically processed by the API server
context.registerModules(modules)
```

### Authentication Integration

```typescript
import { makeAuthService } from '@owlmeans/server-auth'

const authService = makeAuthService()
context.registerService(authService)

// Auth service is automatically used by authentication guards
```

### Resource Integration

```typescript
import { createDbService } from '@owlmeans/mongo-resource'

const dbService = createDbService('mongo', config)
context.registerService(dbService)

// Database services are available in module handlers
```

## Performance Considerations

- **Fastify Framework**: High-performance HTTP server
- **Context Reuse**: Request contexts are reused where possible
- **Validation Caching**: AJV schemas are compiled once and cached
- **Middleware Pipeline**: Efficient middleware processing with early termination
- **File Upload Limits**: Configurable file size and count limits

## Security Features

- **CORS Support**: Configurable cross-origin resource sharing
- **Helmet Integration**: Security headers middleware
- **Authentication Guards**: Built-in authentication checking
- **Authorization Gates**: Fine-grained permission checking
- **Input Validation**: Comprehensive request validation
- **Error Handling**: Secure error message handling

## Best Practices

1. **Module Organization**: Group related endpoints into logical modules
2. **Error Handling**: Use appropriate error types for different failure modes
3. **Validation**: Always validate input data using schema validation
4. **Authentication**: Use authentication guards for protected endpoints
5. **Authorization**: Implement fine-grained authorization with gates
6. **File Uploads**: Configure appropriate file size limits
7. **Context Management**: Use intermediate modules for cross-cutting concerns

## Related Packages

- [`@owlmeans/server-context`](../server-context) - Server context management
- [`@owlmeans/server-module`](../server-module) - Server module system
- [`@owlmeans/auth-common`](../auth-common) - Authentication middleware
- [`@owlmeans/api`](../api) - API utilities and constants
- [`@owlmeans/module`](../module) - Core module system