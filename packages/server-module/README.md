# @owlmeans/server-module

Server-side module system for OwlMeans Common applications. This package provides the infrastructure for building and managing server modules that handle HTTP requests, implement business logic, and integrate with the OwlMeans routing and context systems.

## Overview

The `@owlmeans/server-module` package extends the base OwlMeans module system with server-specific functionality, providing:

- **Server Module Creation**: Factory functions for creating server-side modules
- **Route Integration**: Deep integration with server routing system
- **Request Handling**: Standardized request/response processing
- **Error Management**: Built-in error handling and fixer services
- **Module Elevation**: Converting common modules to server modules
- **Context Integration**: Seamless integration with server context
- **Guard Support**: Authentication and authorization integration
- **Reference Handling**: Module reference system for complex workflows

## Installation

```bash
npm install @owlmeans/server-module
```

## Core Concepts

### Server Module

A `ServerModule` extends the common module interface with server-specific capabilities, including route models, request handlers, and error fixers.

### Module Handler

Functions that process incoming requests and generate responses, with access to the full OwlMeans context system.

### Fixer Service

Error handling services that can intercept and process errors before they're returned to clients.

### Module Elevation

The process of converting common modules to server modules with enhanced capabilities.

## API Reference

### Types

#### `ServerModule<R>`
Core server module interface with request handling capabilities.

```typescript
interface ServerModule<R> extends CommonModule {
  route: ServerRouteModel<R>     // Server-specific route model
  fixer?: string                 // Error fixer service alias
  handle: ModuleHandler          // Request handler function
}
```

#### `ModuleOptions<R>`
Configuration options for module creation.

```typescript
interface ModuleOptions<R> extends CommonModuleOptions {
  force?: boolean                    // Force elevation even if already elevated
  fixer?: string                     // Error fixer service alias
  intermediate?: boolean             // Mark as intermediate module
  routeOptions?: ServerRouteOptions<R>  // Route-specific options
}
```

#### `FixerService`
Service interface for error handling.

```typescript
interface FixerService extends Service {
  handle: <R>(reply: R, error: Error) => void
}
```

#### `RefedModuleHandler<R>`
Handler function that receives module reference.

```typescript
interface RefedModuleHandler<R = {}> {
  (ref: ModuleRef<R>): ModuleHandler
}
```

### Factory Functions

#### `module<R>(arg, handler?, opts?): ServerModule<R>`
Creates a server module from various input types.

**Parameters:**
- `arg`: CommonModule, ServerRouteModel, or CommonRouteModel
- `handler`: Optional request handler function with module reference
- `opts`: Optional module configuration

**Returns:** Configured ServerModule instance

**Examples:**

```typescript
// From route model
const userModule = module(userRoute, (ref) => async (request, reply) => {
  const users = await getUserList()
  reply.resolve(users)
})

// From common module
const elevatedModule = module(commonModule, handler, { 
  fixer: 'error-handler',
  force: true 
})

// With options
const apiModule = module(apiRoute, handler, {
  intermediate: true,
  routeOptions: { cors: true }
})
```

#### `elevate<R>(modules, alias, handler?, opts?): ServerModule<R>[]`
Elevates common modules to server modules within a module collection.

**Parameters:**
- `modules`: Array of modules to search within
- `alias`: Alias of module to elevate
- `handler`: Optional new handler function
- `opts`: Optional elevation options

**Returns:** Updated modules array with elevated module

**Example:**

```typescript
const modules = [commonModule1, commonModule2, commonModule3]

// Elevate specific module
const elevated = elevate(modules, 'user-api', (ref) => async (req, reply) => {
  // New server-specific handler
  const result = await processUserRequest(req)
  reply.resolve(result)
}, { fixer: 'user-error-handler' })
```

### Module Creation Patterns

#### Basic Request Handler

```typescript
import { module } from '@owlmeans/server-module'

const userModule = module(userRoute, (ref) => async (request, reply) => {
  try {
    const { params, query, body } = request
    
    // Business logic
    const users = await userService.list(query)
    
    // Successful response
    reply.resolve(users, ModuleOutcome.Ok)
  } catch (error) {
    // Error handling
    reply.reject(error)
  }
})
```

#### Module with Context Access

```typescript
const contextAwareModule = module(route, (ref) => async (request, reply) => {
  const context = ref.ref?.ctx
  
  // Access services from context
  const dbService = context?.service('database')
  const authService = context?.service('auth')
  
  // Process request with context
  const user = authService.user()
  const data = await dbService.get(request.params.id)
  
  reply.resolve(data)
})
```

#### Module with Error Fixer

```typescript
const resilientModule = module(route, handler, {
  fixer: 'error-fixer'
})

// Error fixer service
const errorFixer: FixerService = {
  alias: 'error-fixer',
  initialized: true,
  
  handle: (reply, error) => {
    if (error instanceof ValidationError) {
      reply.reject(new BadRequestError(error.message))
    } else if (error instanceof DatabaseError) {
      reply.reject(new InternalServerError('Service temporarily unavailable'))
    } else {
      reply.reject(error)
    }
  }
}
```

## Usage Examples

### Basic CRUD Module

```typescript
import { module } from '@owlmeans/server-module'
import { route } from '@owlmeans/server-route'

// Define route
const userRoute = route({
  path: '/users/:id?',
  method: RouteMethod.GET,
  alias: 'user-crud'
})

// Create module
const userModule = module(userRoute, (ref) => async (request, reply) => {
  const { params, query } = request
  
  if (params.id) {
    // Get single user
    const user = await userService.get(params.id)
    reply.resolve(user)
  } else {
    // List users
    const users = await userService.list(query)
    reply.resolve(users)
  }
})
```

### Authenticated Module

```typescript
const protectedModule = module(protectedRoute, (ref) => async (request, reply) => {
  // Access authentication from context
  const authService = ref.ref?.ctx?.service('auth')
  const currentUser = authService?.user()
  
  if (!currentUser) {
    reply.reject(new UnauthorizedError('Authentication required'))
    return
  }
  
  // Process authenticated request
  const data = await processForUser(currentUser, request)
  reply.resolve(data)
}, {
  guards: ['auth-guard']
})
```

### File Upload Module

```typescript
const uploadModule = module(uploadRoute, (ref) => async (request, reply) => {
  const { body, headers } = request
  
  // Handle file upload
  if (headers['content-type']?.includes('multipart/form-data')) {
    const files = await parseMultipartFiles(body)
    const saved = await fileService.saveFiles(files)
    
    reply.resolve(saved, ModuleOutcome.Created)
  } else {
    reply.reject(new BadRequestError('Multipart data required'))
  }
})
```

### Module with Database Transaction

```typescript
const transactionalModule = module(route, (ref) => async (request, reply) => {
  const dbService = ref.ref?.ctx?.service('database')
  const transaction = await dbService.startTransaction()
  
  try {
    const user = await userService.create(request.body, { transaction })
    const profile = await profileService.create(user.id, { transaction })
    
    await transaction.commit()
    reply.resolve({ user, profile }, ModuleOutcome.Created)
  } catch (error) {
    await transaction.rollback()
    reply.reject(error)
  }
})
```

### Module Composition

```typescript
// Base module
const baseModule = module(baseRoute, (ref) => async (request, reply) => {
  // Base functionality
  const result = await processBase(request)
  reply.resolve(result)
})

// Elevated module with additional features
const elevatedModules = elevate([baseModule], 'base-route', (ref) => async (request, reply) => {
  // Enhanced functionality
  const enhanced = await enhanceProcessing(request)
  const result = await processBase(enhanced)
  reply.resolve(result)
}, {
  fixer: 'enhanced-error-handler'
})
```

### Module Factory Pattern

```typescript
const createCrudModule = <T>(
  resource: string,
  service: CrudService<T>
) => {
  const crudRoute = route({
    path: `/${resource}/:id?`,
    method: RouteMethod.GET,
    alias: `${resource}-crud`
  })
  
  return module(crudRoute, (ref) => async (request, reply) => {
    const { params, query, body } = request
    
    switch (request.method) {
      case 'GET':
        if (params.id) {
          const item = await service.get(params.id)
          reply.resolve(item)
        } else {
          const items = await service.list(query)
          reply.resolve(items)
        }
        break
        
      case 'POST':
        const created = await service.create(body)
        reply.resolve(created, ModuleOutcome.Created)
        break
        
      case 'PUT':
        const updated = await service.update(params.id, body)
        reply.resolve(updated)
        break
        
      case 'DELETE':
        await service.delete(params.id)
        reply.resolve(null, ModuleOutcome.Finished)
        break
        
      default:
        reply.reject(new MethodNotAllowedError())
    }
  })
}

// Usage
const userModule = createCrudModule('users', userService)
const productModule = createCrudModule('products', productService)
```

### Middleware Integration

```typescript
const middlewareModule = module(route, (ref) => async (request, reply) => {
  // Pre-processing middleware
  await validateRequest(request)
  await logRequest(request)
  
  // Main processing
  const result = await processRequest(request)
  
  // Post-processing middleware
  await logResponse(result)
  await cacheResponse(request, result)
  
  reply.resolve(result)
})
```

### Error Handling Patterns

```typescript
// Global error fixer
const globalFixer: FixerService = {
  alias: 'global-error-fixer',
  initialized: true,
  
  handle: (reply, error) => {
    // Log error
    console.error('Module error:', error)
    
    // Transform known errors
    if (error.name === 'ValidationError') {
      reply.reject(new BadRequestError(error.message))
    } else if (error.name === 'NotFoundError') {
      reply.reject(new NotFoundError(error.message))
    } else {
      // Generic error for unknown issues
      reply.reject(new InternalServerError('An unexpected error occurred'))
    }
  }
}

// Module with error handling
const robustModule = module(route, (ref) => async (request, reply) => {
  try {
    const result = await riskyOperation(request)
    reply.resolve(result)
  } catch (error) {
    // Let fixer handle the error
    throw error
  }
}, {
  fixer: 'global-error-fixer'
})
```

## Advanced Features

### Module Chaining

```typescript
const chainModules = (modules: ServerModule<any>[]) => {
  return modules.reduce((chain, module, index) => {
    const nextModule = modules[index + 1]
    
    if (nextModule) {
      // Chain modules together
      const originalHandler = module.handle
      module.handle = async (request, reply) => {
        const result = await originalHandler(request, reply)
        
        // Pass result to next module
        if (result) {
          request.body = result
          return nextModule.handle(request, reply)
        }
        
        return result
      }
    }
    
    return module
  })
}
```

### Dynamic Module Loading

```typescript
const loadModuleFromConfig = async (config: ModuleConfig) => {
  const route = await loadRoute(config.routeId)
  const handler = await loadHandler(config.handlerId)
  
  return module(route, handler, {
    fixer: config.errorHandler,
    guards: config.guards
  })
}
```

### Module Testing

```typescript
import { createTestContext } from '@owlmeans/server-context'

describe('User Module', () => {
  let context: ServerContext
  let userModule: ServerModule<any>
  
  beforeEach(() => {
    context = createTestContext(testConfig)
    userModule = module(userRoute, userHandler)
    userModule.ctx = context
  })
  
  it('should handle user creation', async () => {
    const request = {
      method: 'POST',
      body: { name: 'John Doe', email: 'john@example.com' },
      params: {},
      query: {},
      headers: {}
    }
    
    const reply = createMockReply()
    await userModule.handle(request, reply)
    
    expect(reply.resolved).toBe(true)
    expect(reply.value).toHaveProperty('id')
  })
})
```

## Integration with OwlMeans Ecosystem

The `@owlmeans/server-module` package integrates with:

- **@owlmeans/module**: Base module system and interfaces
- **@owlmeans/server-route**: Server routing and path handling
- **@owlmeans/context**: Dependency injection and service access
- **@owlmeans/server-context**: Server-specific context features
- **@owlmeans/auth-common**: Authentication and authorization
- **@owlmeans/resource**: Data persistence and management
- **@owlmeans/error**: Error handling and transformation

## Best Practices

### Module Design
- Keep modules focused on single responsibilities
- Use descriptive aliases for easy identification
- Implement proper error handling in all handlers
- Validate input data before processing

### Performance
- Cache frequently accessed data
- Use streaming for large response payloads
- Implement proper pagination for list operations
- Monitor module execution times

### Security
- Always validate and sanitize input data
- Use appropriate authentication guards
- Implement proper authorization checks
- Log security-relevant events

### Testing
- Write unit tests for module handlers
- Use test contexts for isolated testing
- Mock external dependencies appropriately
- Test error scenarios thoroughly

Fixes #32.