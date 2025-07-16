# @owlmeans/context

The **@owlmeans/context** package provides dependency management for OwlMeans Common libraries, specifically designed for fullstack microservices and microclients development.

## Purpose

This package serves as a foundational dependency injection and management system that enables:

- **Service Registration and Resolution**: Register and access services across different application layers
- **Module Management**: Handle URL units that declare routes and nesting for both frontend and backend
- **Resource Management**: Manage data sources and external resources with proper initialization
- **Middleware System**: Apply cross-cutting concerns at different stages of the application lifecycle
- **Multi-layer Architecture**: Support hierarchical layers (System, Global, Service, Entity, User) for complex applications

## Key Concepts

### Context
A context acts as an application instance that manages the lifecycle and dependencies of services, modules, and resources. Multiple contexts can exist within one application with different capabilities.

### Layers
The package supports a hierarchical layer system:
- **System**: System-wide components
- **Global**: Global application components  
- **Service**: Service-specific components
- **Entity**: Entity-specific components
- **User**: User-specific components

### Modules
In the context of OwlMeans Common libraries, a "module" is not a programmatic module but a URL unit in the system. Modules allow you to:
- Declare URLs and nesting structure
- Transform URLs to routes and attach handlers on the backend
- Specify which components to render on the frontend
- Generate final URLs for navigation or API calls
- Maintain a single source of truth for all possible routes

### Services
Services are components that provide functionality and can be initialized either immediately or lazily.

### Resources
Resources are components that provide data or external functionality and can be initialized when needed.

### Middlewares
Middlewares are components that can be applied at different stages of the context lifecycle to provide cross-cutting functionality.

## API Reference

### Factory Functions

The package uses factory functions instead of constructors for object creation:

#### `makeBasicContext<C extends BasicConfig>(cfg: C): BasicContext<C>`

Creates a basic context instance.

```typescript
import { makeBasicContext, makeBasicConfig, AppType } from '@owlmeans/context'

const config = makeBasicConfig(AppType.Backend, 'my-service')
const context = makeBasicContext(config)
```

#### `makeBasicConfig<C extends BasicConfig>(type: AppType, service: string, cfg?: Partial<C>): C`

Creates a basic configuration object.

**Parameters:**
- `type`: Application type (Frontend or Backend)
- `service`: Service name
- `cfg`: Additional configuration options

```typescript
import { makeBasicConfig, AppType, Layer } from '@owlmeans/context'

const config = makeBasicConfig(AppType.Frontend, 'web-client', {
  layer: Layer.Service,
  debug: { all: true }
})
```

#### `createService<S extends InitializedService>(alias: string, service: Partial<S>, init?: InitMethod<S>): S`

Creates a service that initializes immediately.

```typescript
import { createService } from '@owlmeans/context'

const myService = createService('my-service', {
  // service implementation
}, (service) => async () => {
  // initialization logic
  console.log('Service initialized')
  service.initialized = true
})
```

#### `createLazyService<S extends LazyService>(alias: string, service: Partial<S>, init?: InitMethod<S>): S`

Creates a service that initializes only when first accessed.

```typescript
import { createLazyService } from '@owlmeans/context'

const lazyService = createLazyService('lazy-service', {
  // service implementation
}, (service) => async () => {
  // lazy initialization logic
  console.log('Lazy service initialized')
  service.initialized = true
})
```

#### `appendContextual<T extends Contextual>(alias: string, contextual: Partial<T>): T`

Helps make objects contextual by adding context management capabilities.

```typescript
import { appendContextual } from '@owlmeans/context'

const contextualObject = appendContextual('my-object', {
  // object implementation
})
```

### Core Interfaces

#### `BasicContext<C extends BasicConfig>`

The main context interface that provides comprehensive dependency management. Each method serves a specific purpose in the context lifecycle and dependency resolution:

```typescript
interface BasicContext<C extends BasicConfig> {
  cfg: C
  stage: ContextStage
  
  // Lifecycle methods
  waitForConfigured(): Promise<boolean>
  waitForInitialized(): Promise<boolean>
  configure<T extends BasicContext<C>>(): T
  init<T extends BasicContext<C>>(): Promise<T>
  
  // Registration methods
  registerService<T extends BasicContext<C>>(service: Service): T
  registerModule<T extends BasicContext<C>>(module: BasicModule): T
  registerModules<T extends BasicContext<C>>(modules: BasicModule[]): T
  registerResource<T extends BasicContext<C>>(resource: BasicResource): T
  registerMiddleware<T extends BasicContext<C>>(middleware: Middleware): T
  
  // Access methods
  service<T extends Service>(alias: string): T
  module<T extends BasicModule>(alias: string): T
  resource<T extends BasicResource>(alias: string): T
  modules<T extends BasicModule>(): T[]
  
  // Utility methods
  hasResource(alias: string): boolean
  hasService(alias: string): boolean
  
  get config(): Promise<C>
}
```

### Context Methods Detailed Reference

#### Lifecycle Methods

**`waitForConfigured(): Promise<boolean>`**
- **Purpose**: Returns a promise that resolves when the context has completed its configuration stage
- **Usage**: Useful for waiting for configuration to complete before proceeding
- **Returns**: Promise that resolves to `true` when configuration is complete

**`waitForInitialized(): Promise<boolean>`**
- **Purpose**: Returns a promise that resolves when the context has completed initialization and reached the Ready stage
- **Usage**: Essential for ensuring all services and resources are initialized before use
- **Returns**: Promise that resolves to `true` when initialization is complete

**`configure<T extends BasicContext<C>>(): T`**
- **Purpose**: Transitions the context from Configuration stage to Loading stage
- **Behavior**: Applies configuration middlewares and prepares the context for initialization
- **Usage**: Must be called after registering all components and before `init()`
- **Returns**: The context instance for method chaining

**`init<T extends BasicContext<C>>(): Promise<T>`**
- **Purpose**: Initializes all registered services and resources, transitioning context to Ready stage
- **Behavior**: 
  - Executes `init()` methods on all registered services
  - Initializes all resources according to their layer availability
  - Applies loading and ready stage middlewares
  - Marks context as ready for use
- **Usage**: Must be called after `configure()` to make the context operational
- **Returns**: Promise that resolves to the initialized context instance

#### Registration Methods

**`registerService<T extends BasicContext<C>>(service: Service): T`**
- **Purpose**: Registers a service with the context for dependency injection
- **Behavior**: 
  - Associates the service with the current context
  - Stores the service in the appropriate layer
  - Makes the service available for retrieval via `service()`
- **Usage**: Call during configuration stage to register services
- **Returns**: The context instance for method chaining

**`registerModule<T extends BasicContext<C>>(module: BasicModule): T`**
- **Purpose**: Registers a module (URL unit) with the context
- **Behavior**: 
  - Associates the module with the current context
  - Makes the module available for route resolution and navigation
- **Usage**: Register modules that define URL structures and routing
- **Returns**: The context instance for method chaining

**`registerModules<T extends BasicContext<C>>(modules: BasicModule[]): T`**
- **Purpose**: Convenience method to register multiple modules at once
- **Behavior**: Iterates through the array and registers each module
- **Usage**: Efficient way to register multiple modules simultaneously
- **Returns**: The context instance for method chaining

**`registerResource<T extends BasicContext<C>>(resource: BasicResource): T`**
- **Purpose**: Registers a resource (data source or external service) with the context
- **Behavior**: 
  - Associates the resource with the current context
  - Resources are initialized during context initialization based on layer availability
- **Usage**: Register resources that provide data or external functionality
- **Returns**: The context instance for method chaining

**`registerMiddleware<T extends BasicContext<C>>(middleware: Middleware): T`**
- **Purpose**: Registers middleware for cross-cutting concerns during context lifecycle
- **Behavior**: 
  - Middleware is applied at specific stages (Configuration, Loading, Ready, Switching)
  - Multiple middlewares can be registered for the same stage
- **Usage**: Register middleware for logging, validation, or other cross-cutting functionality
- **Returns**: The context instance for method chaining

#### Access Methods

**`service<T extends Service>(alias: string): T`**
- **Purpose**: Retrieves a registered service by its alias
- **Behavior**: 
  - Looks up the service in the current layer and falls back to Global layer
  - Handles lazy initialization if the service is not yet initialized
  - Throws `SyntaxError` if service is not found or not initialized
- **Usage**: Primary way to access services for dependency injection
- **Returns**: The requested service instance
- **Throws**: `SyntaxError` if service not found or not initialized

**`module<T extends BasicModule>(alias: string): T`**
- **Purpose**: Retrieves a registered module by its alias
- **Behavior**: 
  - Looks up the module in the current layer
  - Throws `SyntaxError` if module is not found
- **Usage**: Access modules for route resolution and navigation
- **Returns**: The requested module instance
- **Throws**: `SyntaxError` if module not found

**`resource<T extends BasicResource>(alias: string): T`**
- **Purpose**: Retrieves a registered resource by its alias
- **Behavior**: 
  - Looks up the resource in the current layer
  - Throws `SyntaxError` if resource is not found
- **Usage**: Access resources for data operations or external service calls
- **Returns**: The requested resource instance
- **Throws**: `SyntaxError` if resource not found

**`modules<T extends BasicModule>(): T[]`**
- **Purpose**: Retrieves all registered modules as an array
- **Behavior**: Returns all modules registered in the current layer
- **Usage**: Useful for iterating over all available modules
- **Returns**: Array of all registered modules

#### Utility Methods

**`hasResource(alias: string): boolean`**
- **Purpose**: Checks if a resource with the given alias exists
- **Behavior**: Searches across all layers for the resource
- **Usage**: Defensive programming to check resource availability before access
- **Returns**: `true` if resource exists, `false` otherwise

**`hasService(alias: string): boolean`**
- **Purpose**: Checks if a service with the given alias exists
- **Behavior**: Searches across all layers for the service
- **Usage**: Defensive programming to check service availability before access
- **Returns**: `true` if service exists, `false` otherwise

#### Configuration Access

**`get config(): Promise<C>`**
- **Purpose**: Provides access to the context configuration after it's been configured
- **Behavior**: Returns a promise that resolves to the configuration object once context is configured
- **Usage**: Access configuration settings after context setup
- **Returns**: Promise that resolves to the configuration object

#### Properties

**`cfg: C`**
- **Purpose**: Direct access to the context configuration object
- **Usage**: Access configuration settings synchronously
- **Type**: The configuration object of type `C extends BasicConfig`

**`stage: ContextStage`**
- **Purpose**: Indicates the current lifecycle stage of the context
- **Values**: `Configuration`, `Loading`, or `Ready`
- **Usage**: Check context readiness before performing operations

#### `BasicConfig`

Configuration interface for contexts:

```typescript
interface BasicConfig {
  ready: boolean
  service: string
  alias?: string
  layer: Layer
  type: AppType
  layerId?: string
  services?: Record<string, Object>
  debug?: {
    all?: boolean
    [section: string]: boolean | undefined
  }
}
```

#### `Service`

Interface for services:

```typescript
interface Service extends Contextual {
  layers?: Layer[]
  initialized: boolean
  init?: () => Promise<void>
  lazyInit?: () => Promise<void>
  ready?: () => Promise<boolean>
}
```

#### `BasicModule`

Interface for modules:

```typescript
interface BasicModule extends Contextual {
  _module: true
}
```

#### `BasicResource`

Interface for resources:

```typescript
interface BasicResource extends Contextual {
  layers?: Layer[]
  init?: () => Promise<void>
}
```

#### `Middleware`

Interface for middlewares:

```typescript
interface Middleware {
  type: MiddlewareType
  stage: MiddlewareStage
  apply: <C extends BasicConfig, T extends BasicContext<C>>(
    context: T, 
    args?: Record<string, string | undefined>
  ) => Promise<void>
}
```

### Enums

#### `Layer`
```typescript
enum Layer {
  System = 'system',
  Global = 'global',
  Service = 'service',
  Entity = 'entity',
  User = 'user'
}
```

#### `AppType`
```typescript
enum AppType {
  Backend = 'backend',
  Frontend = 'frontend'
}
```

#### `ContextStage`
```typescript
enum ContextStage {
  Configuration = 'configuration',
  Loading = 'loading',
  Ready = 'ready'
}
```

#### `MiddlewareType`
```typescript
enum MiddlewareType {
  Config = 'config',
  Context = 'context'
}
```

#### `MiddlewareStage`
```typescript
enum MiddlewareStage {
  Configuration = 'configuration',
  Loading = 'loading',
  Ready = 'ready',
  Switching = 'switching'
}
```

## Usage Examples

### Basic Usage

```typescript
import { 
  makeBasicContext, 
  makeBasicConfig, 
  createService, 
  AppType, 
  Layer 
} from '@owlmeans/context'

// Create configuration
const config = makeBasicConfig(AppType.Backend, 'my-app', {
  layer: Layer.System,
  debug: { all: true }
})

// Create context
const context = makeBasicContext(config)

// Create and register a service
const myService = createService('database', {
  connect: () => console.log('Connected to database')
}, (service) => async () => {
  // Initialize the service
  service.connect()
  service.initialized = true
})

context.registerService(myService)

// Configure and initialize context
const configuredContext = context.configure()
await configuredContext.init()

// Use the service
const dbService = context.service('database')
```

### Advanced Context Method Usage

```typescript
import { 
  makeBasicContext, 
  makeBasicConfig, 
  createService, 
  createLazyService,
  AppType, 
  Layer,
  ContextStage 
} from '@owlmeans/context'

const config = makeBasicConfig(AppType.Backend, 'advanced-app')
const context = makeBasicContext(config)

// Register multiple services
const cacheService = createService('cache', {
  get: (key: string) => `cached-${key}`,
  set: (key: string, value: any) => console.log(`Set ${key}=${value}`)
})

const logService = createLazyService('logger', {
  log: (message: string) => console.log(`[LOG] ${message}`)
}, (service) => async () => {
  console.log('Logger initialized lazily')
  service.initialized = true
})

context.registerService(cacheService)
context.registerService(logService)

// Check service availability before use
if (context.hasService('cache')) {
  console.log('Cache service is available')
}

// Wait for specific lifecycle stages
await context.waitForConfigured()
console.log('Context configured')

// Configure and initialize
context.configure()
await context.init()

// Check current stage
console.log('Current stage:', context.stage) // ContextStage.Ready

// Access configuration after initialization
const finalConfig = await context.config
console.log('Final config:', finalConfig.service)

// Service access - cache service is already initialized
const cache = context.service('cache')
cache.set('key1', 'value1')

// Lazy service access - will initialize on first access
const logger = context.service('logger') // Triggers lazy initialization
logger.log('Application ready')
```

### Method Chaining and Error Handling

```typescript
import { 
  makeBasicContext, 
  makeBasicConfig, 
  createService, 
  appendContextual,
  AppType 
} from '@owlmeans/context'

const config = makeBasicConfig(AppType.Backend, 'chaining-example')
const context = makeBasicContext(config)

// Method chaining for registration
const service1 = createService('service1', { value: 1 })
const service2 = createService('service2', { value: 2 })
const module1 = appendContextual('module1', { _module: true, routes: {} })
const resource1 = appendContextual('resource1', { data: 'test' })

// Chain multiple registrations
context
  .registerService(service1)
  .registerService(service2)
  .registerModule(module1)
  .registerResource(resource1)

// Error handling for service access
try {
  const nonExistentService = context.service('non-existent')
} catch (error) {
  console.error('Service not found:', error.message)
  // Output: Service non-existent not found in layer service
}

// Safe service access using hasService
if (context.hasService('service1')) {
  const service = context.service('service1')
  console.log('Service value:', service.value)
}

// Error handling for uninitialized services
await context.configure().init()

// Now services are accessible
const service = context.service('service1')
console.log('Service accessible after init:', service.value)
```

### Context Lifecycle Management

```typescript
const context = makeBasicContext(config)

// Register components during Configuration stage
console.log('Stage:', context.stage) // ContextStage.Configuration

context.registerService(myService)
context.registerModule(myModule)

// Move to Loading stage
context.configure()
console.log('Stage:', context.stage) // ContextStage.Loading

// Move to Ready stage
await context.init()
console.log('Stage:', context.stage) // ContextStage.Ready

// Context lifecycle promises
const configuredPromise = context.waitForConfigured()
const initializedPromise = context.waitForInitialized()

// Both promises resolve immediately if context is already ready
await configuredPromise // Resolves to true
await initializedPromise // Resolves to true
```

### Module Registration

```typescript
import { appendContextual } from '@owlmeans/context'

// Create a module
const userModule = appendContextual('user', {
  _module: true,
  routes: {
    login: '/login',
    profile: '/profile'
  }
})

// Register the module
context.registerModule(userModule)

// Access the module
const module = context.module('user')
```

### Resource Management

```typescript
const dbResource = appendContextual('db-connection', {
  connection: null,
  init: async () => {
    // Initialize database connection
    console.log('Database connection initialized')
  }
})

context.registerResource(dbResource)

// Resource will be initialized during context initialization
await context.init()

// Access the resource
const db = context.resource('db-connection')
```

### Middleware Usage

```typescript
const loggingMiddleware = {
  type: MiddlewareType.Context,
  stage: MiddlewareStage.Ready,
  apply: async (context) => {
    console.log(`Context ${context.cfg.service} is ready`)
  }
}

context.registerMiddleware(loggingMiddleware)
```

## Context Lifecycle

1. **Configuration Stage**: Register services, modules, resources, and middlewares
2. **Loading Stage**: Initialize services and resources
3. **Ready Stage**: Context is ready for use

```typescript
// Configuration stage
const context = makeBasicContext(config)
context.registerService(myService)
context.registerModule(myModule)

// Move to loading stage
context.configure()

// Initialize and move to ready stage
await context.init()

// Context is now ready
console.log(context.stage) // ContextStage.Ready
```

## Integration with Other Packages

The context package integrates seamlessly with other OwlMeans packages:

```typescript
import { makeServerContext } from '@owlmeans/server-context'
import { makeClientContext } from '@owlmeans/client-context'

// Server-side context with additional capabilities
const serverContext = makeServerContext(serverConfig)

// Client-side context with additional capabilities  
const clientContext = makeClientContext(clientConfig)
```

## Helper Functions

### `assertContext<C extends BasicConfig, T extends BasicContext<C>>(ctx: T | undefined, location?: string): T`

Asserts that a context is defined and throws an error if not.

```typescript
import { assertContext } from '@owlmeans/context'

const context = assertContext(maybeContext, 'MyService')
```

### `isContextWithoutIds<C extends BasicConfig, T extends BasicContext<C>>(context: T): boolean`

Checks if a context operates without IDs (System, Global, or Service layers).

```typescript
import { isContextWithoutIds } from '@owlmeans/context'

const needsIds = !isContextWithoutIds(context)
```

## Error Handling

The package throws `SyntaxError` for common issues:

- Service not found: When accessing an unregistered service
- Module not found: When accessing an unregistered module  
- Resource not found: When accessing an unregistered resource
- Context not found: When context is undefined in a contextual object
- Service not initialized: When accessing a non-initialized service

## Best Practices

1. **Use Factory Functions**: Always use the provided factory functions instead of constructors
2. **Layer Organization**: Organize your components by appropriate layers
3. **Service Initialization**: Choose between immediate and lazy initialization based on your needs
4. **Error Handling**: Always handle potential errors when accessing services, modules, or resources
5. **Context Lifecycle**: Respect the context lifecycle stages
6. **Middleware Order**: Be mindful of middleware execution order and stages

## TypeScript Support

The package is written in TypeScript and provides full type safety:

```typescript
import type { BasicContext, BasicConfig, Service } from '@owlmeans/context'

interface MyConfig extends BasicConfig {
  customOption: string
}

interface MyService extends Service {
  customMethod(): void
}

const context: BasicContext<MyConfig> = makeBasicContext(config)
const service: MyService = context.service('my-service')
```