# OwlMeans Module — Shared library

The `@owlmeans/module` package provides a comprehensive module system for OwlMeans Common Libraries, designed for fullstack microservices and microclients development.

## Overview

In the context of OwlMeans Common Libraries, a **module** is not a programmatic module but a **URL unit** in the system. Modules allow you to:

- Declare URLs and their nesting relationships
- Transform URLs into routes with attached handlers (backend) or specify components to render (frontend)
- Generate final URLs for navigation or API calls on both backend and frontend
- Provide a centralized place where all possible routes are registered
- Enable micro-applications or micro-services to flawlessly address different parts of the system

## Core Concepts

### Module
A module represents a URL unit that can be transformed into routes or components depending on the environment (frontend/backend). It consists of:
- A route with URL path and alias
- Optional guards for authentication/authorization
- Optional gates for parameter validation
- Optional filters for request/response validation
- Optional handlers for processing requests

### Parent-Child Relationships
Modules can be organized in hierarchical structures where child modules inherit properties from their parents, such as guards and gates.

## API Reference

### Types

#### CommonModule
The main module interface that extends `BasicModule` from `@owlmeans/context`.

```typescript
interface CommonModule extends BasicModule {
  route: CommonRouteModel
  sticky: boolean                    // If true, router attaches this module unconditionally
  filter?: Filter                    // Request/response validation schemas
  guards?: string[]                  // Authentication guards
  gate?: string                      // Authorization gate
  gateParams?: string | string[]     // Gate parameters
  handle?: ModuleHandler             // Request handler function
  
  // Methods
  getAlias(): string
  getPath(): string
  getParentAlias(): string | null
  hasParent(): boolean
  resolve<M extends CommonModule>(): Promise<M>
  getParent<M extends CommonModule>(): M
  setService(service: string): void
  getGuards(): string[]
  getGates(): [string, string[]][]
}
```

#### ModuleHandler
Function signature for handling module requests.

```typescript
interface ModuleHandler {
  <T, R extends AbstractRequest<any> = AbstractRequest<any>,
   P extends AbstractResponse<any> = AbstractResponse<any>>
  (req: R, res: P): T | Promise<T>
}
```

#### Filter
Schema definitions for request/response validation using AJV.

```typescript
interface Filter {
  query?: AnySchemaObject      // Query parameters validation
  params?: AnySchemaObject     // Path parameters validation
  body?: AnySchemaObject       // Request body validation
  response?: AnySchemaObject   // Response validation
  headers?: AnySchemaObject    // Headers validation
}
```

#### AbstractRequest
Generic request interface for both frontend and backend.

```typescript
interface AbstractRequest<T extends {} = {}> {
  alias: string
  auth?: Auth
  params: Record<string, string | number | undefined | null> | Partial<T>
  body?: Record<string, any> | Partial<T>
  headers: Record<string, string[] | string | undefined>
  query: Record<string, string | number | undefined | null> | Partial<T>
  path: string
  original?: any
  canceled?: boolean
  cancel?: () => void
  host?: string
  base?: string | boolean
}
```

#### AbstractResponse
Generic response interface for handling module responses.

```typescript
interface AbstractResponse<T> {
  responseProvider?: any
  value?: T
  outcome?: ModuleOutcome
  error?: Error
  resolve(value: T, outcome?: ModuleOutcome): void
  reject(error: Error): void
}
```

### Core Functions

#### module(route, opts?)
Creates a new module instance.

```typescript
function module(route: CommonRouteModel, opts?: CommonModuleOptions): CommonModule
```

**Parameters:**
- `route`: CommonRouteModel - The route configuration
- `opts`: CommonModuleOptions - Optional module configuration

**Returns:** CommonModule instance

**Example:**
```typescript
import { module } from '@owlmeans/module'
import { route } from '@owlmeans/route'

const userModule = module(route('users', '/users'), {
  sticky: true,
  guards: ['authenticated']
})
```

#### parent(module, aliasOrParent, _parent?)
Sets parent-child relationships between modules.

```typescript
function parent<T extends CommonModule | CommonModule[]>(
  module: T, 
  aliasOrParent: string, 
  _parent?: string
): T
```

**Parameters:**
- `module`: CommonModule or CommonModule[] - Module(s) to set parent for
- `aliasOrParent`: string - Parent alias or module alias (when working with arrays)
- `_parent`: string - Parent name (required when working with arrays)

**Returns:** The module(s) with parent relationship set

**Example:**
```typescript
const userModule = module(route('users', '/users'))
const userProfileModule = module(route('user-profile', '/profile'))

parent(userProfileModule, 'users') // Sets users as parent of user-profile
```

### Helper Functions

#### filter(filter, opts?)
Creates module options with filter configuration.

```typescript
function filter(filter: Filter, opts?: CommonModuleOptions): CommonModuleOptions
```

**Example:**
```typescript
const userModule = module(route('users', '/users'), filter({
  query: { type: 'object', properties: { limit: { type: 'number' } } }
}))
```

#### guard(guard, opts?)
Adds authentication guard to module options.

```typescript
function guard(guard: string, opts?: CommonModuleOptions): CommonModuleOptions
```

**Example:**
```typescript
const adminModule = module(route('admin', '/admin'), guard('admin'))
```

#### gate(gate, params, opts?)
Adds authorization gate with parameters to module options.

```typescript
function gate(gate: string, params: string | string[], opts?: CommonModuleOptions): CommonModuleOptions
```

**Example:**
```typescript
const userModule = module(route('user', '/user/:id'), gate('user-access', ['id']))
```

#### provideResponse(originalResponse?)
Creates an abstract response handler.

```typescript
function provideResponse<T>(originalResponse?: unknown): AbstractResponse<T>
```

**Example:**
```typescript
const response = provideResponse<UserData>()
response.resolve(userData, ModuleOutcome.Ok)
```

#### clone(modules, from, to, service)
Clones an existing module with new alias and service.

```typescript
function clone<M extends CommonModule>(
  modules: M[], 
  from: string, 
  to: string, 
  service: string
): void
```

**Parameters:**
- `modules`: M[] - Array of modules to add cloned module to
- `from`: string - Source module alias
- `to`: string - New module alias
- `service`: string - Service name for the cloned module

### Filter Building Functions

#### body(schema, filter?)
Creates or extends a filter with body validation schema.

```typescript
function body<T>(schema: JSONSchemaType<T>, filter?: Filter): Filter
```

#### query(schema, filter?)
Creates or extends a filter with query parameters validation schema.

```typescript
function query<T>(schema: JSONSchemaType<T>, filter?: Filter): Filter
```

#### params(schema, filter?)
Creates or extends a filter with path parameters validation schema.

```typescript
function params<T>(schema: JSONSchemaType<T>, filter?: Filter): Filter
```

#### response(schema, code?, filter?)
Creates or extends a filter with response validation schema.

```typescript
function response<T>(schema: JSONSchemaType<T>, code?: number, filter?: Filter): Filter
```

#### headers(schema, filter?)
Creates or extends a filter with headers validation schema.

```typescript
function headers<T>(schema: JSONSchemaType<T>, filter?: Filter): Filter
```

**Example:**
```typescript
import { body, query, params, response } from '@owlmeans/module'

const userFilter = body({
  type: 'object',
  properties: {
    name: { type: 'string' },
    email: { type: 'string' }
  },
  required: ['name', 'email']
}, query({
  type: 'object',
  properties: {
    include: { type: 'string', enum: ['profile', 'preferences'] }
  }
}))
```

### Utility Functions

#### isModule(object)
Type guard to check if an object is a CommonModule.

```typescript
function isModule(module: Object): module is CommonModule
```

**Example:**
```typescript
if (isModule(someObject)) {
  // someObject is definitely a CommonModule
  console.log(someObject.getAlias())
}
```

### Constants

#### ModuleOutcome
Enumeration of possible module response outcomes.

```typescript
enum ModuleOutcome {
  Ok = 'ok',
  Accepted = 'accepted',
  Created = 'created',
  Finished = 'finished'
}
```

### Service Interfaces

#### GuardService
Service interface for implementing authentication guards.

```typescript
interface GuardService extends InitializedService {
  token?: string
  authenticated(req?: Partial<AbstractRequest>): Promise<string | null>
  match: ModuleMatch
  handle: ModuleHandler
}
```

#### GateService
Service interface for implementing authorization gates.

```typescript
interface GateService extends LazyService {
  assert: ModuleAssert  // Throws Error if assertion fails
}
```

## Usage Examples

### Basic Module Creation

```typescript
import { module, guard, filter, body } from '@owlmeans/module'
import { route } from '@owlmeans/route'

// Create a simple module
const homeModule = module(route('home', '/'))

// Create a protected module with authentication
const dashboardModule = module(
  route('dashboard', '/dashboard'),
  guard('authenticated')
)

// Create a module with request validation
const createUserModule = module(
  route('create-user', '/users', { method: 'POST' }),
  filter(body({
    type: 'object',
    properties: {
      name: { type: 'string' },
      email: { type: 'string' }
    },
    required: ['name', 'email']
  }))
)
```

### Module Hierarchies

```typescript
// Create parent module
const apiModule = module(route('api', '/api'))

// Create child modules
const usersModule = module(route('users', '/users'))
const postsModule = module(route('posts', '/posts'))

// Set parent relationships
parent(usersModule, 'api')
parent(postsModule, 'api')

// Child modules inherit parent guards and gates
const userProfileModule = module(
  route('user-profile', '/profile'),
  guard('user-access')
)
parent(userProfileModule, 'users')
```

### Module with Handler

```typescript
const userModule = module(route('get-user', '/users/:id'), {
  handle: async (req, res) => {
    const userId = req.params.id
    const user = await getUserById(userId)
    res.resolve(user, ModuleOutcome.Ok)
  }
})
```

### Complex Filter Example

```typescript
import { filter, body, query, params, response } from '@owlmeans/module'

const complexModule = module(
  route('complex-api', '/api/users/:id'),
  filter(
    params({
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[0-9]+$' }
      },
      required: ['id']
    },
    query({
      type: 'object',
      properties: {
        include: { type: 'string', enum: ['profile', 'posts'] },
        limit: { type: 'number', minimum: 1, maximum: 100 }
      }
    },
    response({
      type: 'object',
      properties: {
        user: { type: 'object' },
        profile: { type: 'object' }
      },
      required: ['user']
    })))
  )
)
```

## Integration Patterns

### Backend Integration
On the backend, modules are typically transformed into Express-like routes:

```typescript
// Transform module to route with handler
app.get(userModule.getPath(), async (req, res) => {
  const moduleReq = adaptRequest(req)
  const moduleRes = provideResponse()
  
  await userModule.handle(moduleReq, moduleRes)
  
  if (moduleRes.error) {
    res.status(500).json({ error: moduleRes.error.message })
  } else {
    res.json(moduleRes.value)
  }
})
```

### Frontend Integration
On the frontend, modules help generate URLs and determine which components to render:

```typescript
// Generate URL for navigation
const userUrl = userModule.getPath() // '/users/:id'
const finalUrl = userUrl.replace(':id', userId)

// Navigate to the route
router.push(finalUrl)
```

## Best Practices

1. **Organize modules hierarchically** to take advantage of guard and gate inheritance
2. **Use meaningful aliases** for modules to make them easy to reference
3. **Apply filters consistently** to ensure proper validation
4. **Leverage guards and gates** for security at the module level
5. **Keep modules focused** on a single responsibility
6. **Use the clone function** to create variations of existing modules for different services

## Dependencies

This package depends on:
- `@owlmeans/route` - For route management
- `@owlmeans/context` - For contextual module support
- `@owlmeans/auth` - For authentication integration
- `ajv` - For JSON schema validation