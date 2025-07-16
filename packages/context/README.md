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

The main context interface that provides:

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