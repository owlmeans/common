# @owlmeans/server-app

The **@owlmeans/server-app** package provides a comprehensive server application framework for OwlMeans Common Libraries, offering a complete foundation for building secure, scalable backend applications with authentication, API services, and module management.

## Purpose

This package serves as a high-level application framework that combines multiple OwlMeans packages into a cohesive server application foundation, specifically designed for:

- **Complete Application Setup**: Quickly bootstrap full-featured server applications
- **Integrated Authentication**: Built-in authentication and authorization capabilities
- **API Server Management**: Automated API server configuration and lifecycle management
- **Module System Integration**: Seamless integration with the OwlMeans module system
- **Socket Support**: WebSocket functionality for real-time communication
- **Static Resource Serving**: Static file serving capabilities
- **Kubernetes Integration**: Optional Kubernetes deployment and management features
- **Configuration Management**: Comprehensive configuration handling

## Key Concepts

### Application Framework
This package acts as a meta-framework that combines and orchestrates multiple OwlMeans packages to create a complete server application environment.

### Context-driven Architecture
Uses the OwlMeans context system to manage dependencies, services, and application lifecycle in a structured manner.

### Module-first Design
Built around the OwlMeans module system where functionality is organized as URL units that can be transformed into API routes with handlers.

### Integrated Services
Automatically sets up and configures essential services like authentication, API handling, socket communication, and static resource serving.

## Installation

```bash
npm install @owlmeans/server-app
```

## API Reference

### Types

#### `AppConfig`
Application configuration interface extending ServerConfig.

```typescript
interface AppConfig extends ServerConfig, KlusterConfig {
  services: Record<string, ServiceRoute>
}
```

#### `AppContext<C extends AppConfig = AppConfig>`
Application context interface with integrated service capabilities.

```typescript
interface AppContext<C extends AppConfig = AppConfig> extends ServerContext<C>,
  AuthServiceAppend,
  ApiServerAppend { }
```

### Core Functions

#### `makeContext<C extends AppConfig, T extends AppContext<C>>(cfg: C, customize?: boolean): T`

Creates a fully configured application context with all necessary services and middleware.

**Parameters:**
- `cfg`: Application configuration object
- `customize`: Whether to skip default authentication setup (defaults to false)

**Returns:** Configured application context

```typescript
import { makeContext } from '@owlmeans/server-app'

const config = {
  service: 'my-app',
  layer: Layer.System,
  type: AppType.Backend,
  services: {
    'database': { host: 'localhost', port: 5432 }
  }
}

const context = makeContext(config)
```

#### `main<R, C extends AppConfig, T extends AppContext<C>>(ctx: T, modules: (CommonModule | ServerModule<R>)[]): Promise<void>`

Main application entry point that registers modules, initializes the context, and starts the API server.

**Parameters:**
- `ctx`: Application context instance
- `modules`: Array of modules to register with the application

**Returns:** Promise that resolves when the application is running

```typescript
import { main, makeContext } from '@owlmeans/server-app'
import { modules as defaultModules } from '@owlmeans/server-app'

const context = makeContext(config)
const allModules = [...defaultModules, ...customModules]

await main(context, allModules)
```

### Pre-configured Modules

#### `modules`
Default set of modules that provide essential server functionality.

```typescript
const modules: CommonModule[]
```

Includes:
- Server authentication modules
- API configuration modules

### Exported Utilities

The package re-exports commonly used utilities from various OwlMeans packages:

#### Configuration
```typescript
export { config } from '@owlmeans/server-context'
export { sservice } from '@owlmeans/server-config'
export { addWebService } from '@owlmeans/client-config'
export { service, toConfigRecord, PLUGINS } from '@owlmeans/config'
```

#### Module System
```typescript
export { parent, filter, body, params, ModuleOutcome } from '@owlmeans/module'
export { elevate, module, guard } from '@owlmeans/server-module'
export { elevate as celevate } from '@owlmeans/client-module'
export { route as broute } from '@owlmeans/server-route'
export { route } from '@owlmeans/route'
```

#### API Handling
```typescript
export { handleRequest, handleBody, handleParams } from '@owlmeans/server-api'
export type { AbstractRequest as Request, AbstractResponse as Response } from '@owlmeans/module'
```

#### Resource Management
```typescript
export { createListSchema, filterObject } from '@owlmeans/resource'
export type { ListResult } from '@owlmeans/resource'
```

#### Context and Authentication
```typescript
export { AppType, BASE, Layer, assertContext } from '@owlmeans/context'
export { DEFAULT_ALIAS as DAUTH_GUARD } from '@owlmeans/server-auth'
export { GUARD_ED25519, BED255_CASHE_RESOURCE } from '@owlmeans/auth-common'
```

#### Kubernetes Integration
```typescript
export { klusterize } from '@owlmeans/kluster'
```

## Usage Examples

### Basic Application Setup

```typescript
import { makeContext, main, modules, config, service } from '@owlmeans/server-app'
import { AppType, Layer } from '@owlmeans/context'

// Create application configuration
const appConfig = config(
  AppType.Backend,
  'my-server-app',
  service('database', {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432')
  }),
  {
    layer: Layer.System,
    port: 3000,
    services: {
      'auth-service': { host: 'localhost', port: 3001 },
      'api-gateway': { host: 'localhost', port: 3002 }
    }
  }
)

// Create application context
const context = makeContext(appConfig)

// Start the application
await main(context, modules)
console.log('Server started on port 3000')
```

### Custom Module Integration

```typescript
import { 
  makeContext, 
  main, 
  modules, 
  module, 
  route, 
  guard, 
  filter, 
  body, 
  handleRequest 
} from '@owlmeans/server-app'

// Create custom modules
const userModule = module(
  route('users', '/api/users', { method: 'GET' }),
  guard('authenticated')
)

elevate(userModule, 'users', handleRequest(async (req, res) => {
  const users = await getUsersFromDatabase()
  res.resolve(users)
}))

const createUserModule = module(
  route('create-user', '/api/users', { method: 'POST' }),
  filter(body({
    type: 'object',
    properties: {
      name: { type: 'string' },
      email: { type: 'string' }
    },
    required: ['name', 'email']
  }), guard('authenticated'))
)

elevate(createUserModule, 'create-user', handleRequest(async (req, res) => {
  const userData = req.body
  const user = await createUser(userData)
  res.resolve(user, ModuleOutcome.Created)
}))

// Combine with default modules
const allModules = [...modules, userModule, createUserModule]

// Create and start application
const context = makeContext(appConfig)
await main(context, allModules)
```

### Database Integration

```typescript
import { makeContext, main, service, config } from '@owlmeans/server-app'

// Configure database service
const appConfig = config(
  AppType.Backend,
  'data-app',
  service('mongodb', {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
    database: 'myapp'
  }),
  service('redis', {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
  })
)

const context = makeContext(appConfig)

// Register database-related modules
const databaseModules = [
  // Your database modules here
]

await main(context, [...modules, ...databaseModules])
```

### Authentication and Authorization

```typescript
import { 
  makeContext, 
  main, 
  modules, 
  module, 
  route, 
  guard, 
  DAUTH_GUARD,
  GUARD_ED25519 
} from '@owlmeans/server-app'

// Create protected admin module
const adminModule = module(
  route('admin', '/api/admin', { method: 'GET' }),
  guard([DAUTH_GUARD, GUARD_ED25519]) // Multiple guards
)

elevate(adminModule, 'admin', handleRequest(async (req, res) => {
  // Only authenticated users with proper keys can access
  const adminData = await getAdminData()
  res.resolve(adminData)
}))

const context = makeContext(appConfig)
await main(context, [...modules, adminModule])
```

### WebSocket Integration

```typescript
import { makeContext, main, modules } from '@owlmeans/server-app'

// WebSocket is automatically configured in makeContext
const context = makeContext(appConfig)

// Access socket service if needed
await context.configure().init()
const socketService = context.service('socket')

// Register socket event handlers
socketService.on('user-connected', (socket, data) => {
  console.log('User connected:', data.userId)
})

await main(context, modules)
```

### Static File Serving

```typescript
import { makeContext, main, modules } from '@owlmeans/server-app'

const appConfig = config(
  AppType.Backend,
  'web-server',
  {
    staticPath: './public',
    staticRoute: '/static'
  }
)

// Static resource serving is automatically configured
const context = makeContext(appConfig)
await main(context, modules)

// Now files in ./public are served at /static/*
```

### Custom Context Configuration

```typescript
import { makeContext, main, appendCustomService } from '@owlmeans/server-app'

// Create context with custom flag to skip default auth
const context = makeContext(appConfig, true) // customize = true

// Add custom services
const customService = createService('custom-service', {
  process: async (data) => {
    return processData(data)
  }
})

context.registerService(customService)

// Add custom authentication if needed
// ... custom auth setup

await main(context, modules)
```

### Environment-based Configuration

```typescript
import { 
  makeContext, 
  main, 
  modules, 
  config, 
  service, 
  toConfigRecord 
} from '@owlmeans/server-app'

// Create environment-aware configuration
const appConfig = config(
  AppType.Backend,
  process.env.SERVICE_NAME || 'default-app',
  ...toConfigRecord({
    'database': {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      ssl: process.env.NODE_ENV === 'production'
    },
    'redis': {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379')
    }
  }),
  {
    layer: process.env.NODE_ENV === 'production' ? Layer.Service : Layer.System,
    port: parseInt(process.env.PORT || '3000'),
    debug: {
      all: process.env.NODE_ENV !== 'production'
    }
  }
)

const context = makeContext(appConfig)
await main(context, modules)
```

### API Route Management

```typescript
import { 
  module, 
  route, 
  broute,
  filter, 
  body, 
  params, 
  guard,
  handleRequest,
  handleBody,
  handleParams
} from '@owlmeans/server-app'

// Create REST API modules
const userRoutes = [
  // GET /api/users
  module(
    broute('list-users', '/api/users'),
    guard('authenticated')
  ),
  
  // GET /api/users/:id
  module(
    broute('get-user', '/api/users/:id'),
    filter(params({
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[0-9]+$' }
      },
      required: ['id']
    }), guard('authenticated'))
  ),
  
  // POST /api/users
  module(
    broute('create-user', '/api/users', { method: 'POST' }),
    filter(body({
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        email: { type: 'string', format: 'email' }
      },
      required: ['name', 'email']
    }), guard('authenticated'))
  )
]

// Add handlers
userRoutes.forEach(userModule => {
  switch (userModule.getAlias()) {
    case 'list-users':
      elevate(userModule, 'list-users', handleRequest(async (req, res) => {
        const users = await listUsers()
        res.resolve(users)
      }))
      break
    case 'get-user':
      elevate(userModule, 'get-user', handleParams(async (req, res) => {
        const user = await getUserById(req.params.id)
        res.resolve(user)
      }))
      break
    case 'create-user':
      elevate(userModule, 'create-user', handleBody(async (req, res) => {
        const user = await createUser(req.body)
        res.resolve(user, ModuleOutcome.Created)
      }))
      break
  }
})
```

## Integration Patterns

### Microservice Architecture

```typescript
import { makeContext, main, klusterize } from '@owlmeans/server-app'

// Configure for Kubernetes deployment
const appConfig = config(
  AppType.Backend,
  'user-service',
  klusterize({
    namespace: 'production',
    serviceName: 'user-service',
    replicas: 3
  }),
  {
    port: 8080,
    services: {
      'auth-service': { 
        host: 'auth-service.production.svc.cluster.local',
        port: 8080 
      }
    }
  }
)

const context = makeContext(appConfig)
await main(context, [...modules, ...userServiceModules])
```

### API Gateway Pattern

```typescript
// API Gateway service
const gatewayConfig = config(
  AppType.Backend,
  'api-gateway',
  {
    port: 80,
    services: {
      'user-service': { host: 'user-service', port: 8080 },
      'order-service': { host: 'order-service', port: 8080 },
      'payment-service': { host: 'payment-service', port: 8080 }
    }
  }
)

// Proxy modules that forward requests to appropriate services
const proxyModules = [
  createProxyModule('/api/users', 'user-service'),
  createProxyModule('/api/orders', 'order-service'),
  createProxyModule('/api/payments', 'payment-service')
]
```

### Development vs Production

```typescript
import { makeContext, main, modules } from '@owlmeans/server-app'

const isDevelopment = process.env.NODE_ENV === 'development'

const appConfig = config(
  AppType.Backend,
  'app',
  {
    port: isDevelopment ? 3000 : 8080,
    debug: { all: isDevelopment },
    layer: isDevelopment ? Layer.System : Layer.Service,
    services: isDevelopment ? {
      'database': { host: 'localhost', port: 5432 }
    } : {
      'database': { 
        host: 'postgres.production.svc.cluster.local', 
        port: 5432 
      }
    }
  }
)

const context = makeContext(appConfig)
await main(context, modules)
```

## Error Handling

```typescript
import { main, makeContext } from '@owlmeans/server-app'

try {
  const context = makeContext(appConfig)
  await main(context, modules)
} catch (error) {
  console.error('Application failed to start:', error)
  
  // Graceful shutdown
  process.exit(1)
}

// Handle process signals
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully')
  // Cleanup logic here
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully')
  // Cleanup logic here
  process.exit(0)
})
```

## Best Practices

1. **Configuration Management**: Use environment variables for configuration
2. **Module Organization**: Group related functionality into modules
3. **Authentication**: Always implement proper authentication and authorization
4. **Error Handling**: Implement comprehensive error handling and logging
5. **Monitoring**: Add health check endpoints and monitoring capabilities
6. **Security**: Follow security best practices for API development
7. **Documentation**: Document your API endpoints and their contracts
8. **Testing**: Write comprehensive tests for your modules and handlers

## Dependencies

This package depends on:
- `@owlmeans/api` - API framework
- `@owlmeans/client-config` - Client configuration utilities
- `@owlmeans/config` - Configuration management
- `@owlmeans/context` - Context management system
- `@owlmeans/kluster` - Kubernetes integration
- `@owlmeans/module` - Module system
- `@owlmeans/route` - Routing functionality
- `@owlmeans/server-api` - Server API framework
- `@owlmeans/server-auth` - Server authentication
- `@owlmeans/server-context` - Server context management
- `@owlmeans/server-module` - Server module system
- `@owlmeans/server-route` - Server routing
- `@owlmeans/server-socket` - WebSocket support
- `@owlmeans/static-resource` - Static file serving

## Related Packages

- [`@owlmeans/server-context`](../server-context) - Server context management
- [`@owlmeans/server-api`](../server-api) - Server API framework
- [`@owlmeans/server-auth`](../server-auth) - Server authentication
- [`@owlmeans/server-module`](../server-module) - Server module system
- [`@owlmeans/kluster`](../kluster) - Kubernetes integration