# OwlMeans Client Module

The `@owlmeans/client-module` package provides a client-side extension of the OwlMeans module system, specifically designed for frontend applications. It extends the core `@owlmeans/module` package with client-specific functionality including API calls, URL generation, and request validation.

## Overview

The client module system builds upon the foundational module concepts from `@owlmeans/module` but adds client-specific capabilities:

- **API Calls**: Automatically handle API requests to backend services
- **URL Generation**: Generate URLs for client-side navigation
- **Request Validation**: Validate requests before making API calls
- **Module Elevation**: Transform basic modules into client modules with enhanced capabilities
- **Context Integration**: Seamlessly integrate with client contexts for configuration and services

## Key Concepts

### ClientModule
A `ClientModule` extends the basic module concept with client-specific methods for making API calls and generating URLs. It maintains the same route, guard, and validation system as the base module while adding client-side functionality.

### Module Elevation
The process of transforming a basic module into a client module with enhanced capabilities. This allows you to upgrade existing modules to support client-side operations.

### API vs URL Calls
Client modules can operate in two modes:
- **API Mode**: Makes actual HTTP requests to backend services
- **URL Mode**: Generates URLs for client-side navigation and routing

## Installation

```bash
npm install @owlmeans/client-module
```

## Core API Reference

### Types

#### ClientModule<T, R>
Main interface that extends `CommonModule` with client-specific functionality.

```typescript
interface ClientModule<T = {}, R extends ClientRequest = ClientRequest> extends CommonModule {
  route: ClientRouteModel
  call: ModuleCall<T, R>
  validate: ModuleFilter<R>
  getPath: (partial?: boolean) => string
  request: (request?: Partial<R>) => R
}
```

**Properties:**
- `route`: ClientRouteModel - Enhanced route model with client-specific features
- `call`: ModuleCall<T, R> - Function to make API calls or generate URLs
- `validate`: ModuleFilter<R> - Function to validate requests
- `getPath`: Function to get the module path (full or partial)
- `request`: Function to create a request object for the module

#### ClientRequest<T>
Extended request interface with client-specific properties.

```typescript
interface ClientRequest<T extends {} = {}> extends AbstractRequest<T> {
  full?: boolean  // Whether to generate full URLs with domain
}
```

#### ClientModuleOptions
Configuration options for creating client modules.

```typescript
interface ClientModuleOptions extends CommonModuleOptions {
  force?: boolean                    // Force module elevation even if already elevated
  routeOptions?: ClientRouteOptions  // Client-specific route options
  validateOnCall?: boolean           // Whether to validate requests before API calls
}
```

#### ModuleCall<T, R>
Function signature for making module calls.

```typescript
interface ModuleCall<T, Req extends ClientRequest = ClientRequest> {
  <Type extends T, R extends Req = Req, P extends AbstractResponse<Type> = AbstractResponse<Type>>
  (req?: Partial<R>, res?: P): Promise<[Type, ModuleOutcome]>
}
```

#### ModuleFilter<R>
Function signature for validating module requests.

```typescript
interface ModuleFilter<Req extends AbstractRequest = AbstractRequest> {
  <R extends Req>(req?: Partial<R>): Promise<boolean>
}
```

### Core Functions

#### module(route, handler?, opts?)
Creates a new client module instance.

```typescript
function module<T, R extends AbstractRequest = AbstractRequest>(
  arg: CommonModule | ClientRouteModel | CommonRouteModel,
  handler?: RefedModuleHandler<T, R> | ClientModuleOptions | boolean,
  opts?: ClientModuleOptions | boolean
): ClientModule<T, R>
```

**Parameters:**
- `arg`: Module source - can be an existing module, client route model, or common route model
- `handler`: Optional handler function or options object
- `opts`: Optional configuration options

**Returns:** ClientModule instance

**Example:**
```typescript
import { module } from '@owlmeans/client-module'
import { route } from '@owlmeans/client-route'

// Create a client module for API calls
const userModule = module(route('users', '/api/users'))

// Create a client module with validation
const createUserModule = module(
  route('create-user', '/api/users', { method: 'POST' }),
  { validateOnCall: true }
)

// Create a client module with custom handler
const navigationModule = module(
  route('profile', '/profile'),
  ({ ref }) => async (req, res) => {
    // Custom handler logic
    const url = ref.getPath()
    res.resolve(url, ModuleOutcome.Ok)
  }
)
```

#### elevate(modules, alias, handler?, opts?)
Elevates an existing module to a client module with enhanced capabilities.

```typescript
function elevate<T = {}, R extends AbstractRequest = AbstractRequest>(
  modules: (CommonModule | ClientModule<T, R>)[],
  alias: string,
  handler?: RefedModuleHandler<T, R> | ClientModuleOptions | boolean,
  opts?: ClientModuleOptions | boolean
): ClientModule<T, R>[]
```

**Parameters:**
- `modules`: Array of modules to search and elevate
- `alias`: Alias of the module to elevate
- `handler`: Optional handler function or options
- `opts`: Optional configuration options

**Returns:** Array of modules with the specified module elevated

**Example:**
```typescript
import { elevate } from '@owlmeans/client-module'

const modules = [
  basicUserModule,
  basicProfileModule
]

// Elevate the user module to support API calls
const elevatedModules = elevate(modules, 'users', {
  validateOnCall: true
})
```

#### stab
A stub handler that returns undefined - useful for modules that don't need custom handling.

```typescript
const stab: RefedModuleHandler<{}> = () => () => {
  return void 0 as any
}
```

**Example:**
```typescript
const simpleModule = module(route('simple', '/simple'), stab)
```

#### provideRequest(alias, path)
Creates a basic request object for a module.

```typescript
function provideRequest<T extends {} = {}>(alias: string, path: string): AbstractRequest<T>
```

**Parameters:**
- `alias`: Module alias
- `path`: Module path

**Returns:** Basic request object

**Example:**
```typescript
const request = provideRequest('users', '/api/users')
request.query = { limit: 10 }
```

### Module Methods

#### call(req?, res?)
Makes an API call or generates a URL depending on the module configuration.

```typescript
const [result, outcome] = await userModule.call({
  params: { id: '123' },
  query: { include: 'profile' }
})
```

#### validate(req?)
Validates a request against the module's filter schema.

```typescript
const isValid = await userModule.validate({
  params: { id: '123' },
  body: { name: 'John' }
})
```

#### getPath(partial?)
Gets the module path, optionally returning a partial path.

```typescript
const fullPath = userModule.getPath()     // '/api/users/:id'
const partialPath = userModule.getPath(true)  // '/users/:id'
```

#### request(request?)
Creates a request object for the module with optional overrides.

```typescript
const request = userModule.request({
  params: { id: '123' },
  query: { include: 'profile' }
})
```

## Usage Examples

### Basic API Module

```typescript
import { module } from '@owlmeans/client-module'
import { route } from '@owlmeans/client-route'

// Create a module for fetching users
const usersModule = module(route('users', '/api/users'))

// Make an API call
const [users, outcome] = await usersModule.call({
  query: { limit: 10, page: 1 }
})
```

### Module with Validation

```typescript
import { module, filter, body } from '@owlmeans/client-module'
import { route } from '@owlmeans/client-route'

// Create a module with request validation
const createUserModule = module(
  route('create-user', '/api/users', { method: 'POST' }),
  {
    validateOnCall: true,
    filter: body({
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string', format: 'email' }
      },
      required: ['name', 'email']
    })
  }
)

// This will validate the request before making the API call
const [user, outcome] = await createUserModule.call({
  body: {
    name: 'John Doe',
    email: 'john@example.com'
  }
})
```

### Navigation Module

```typescript
import { module } from '@owlmeans/client-module'
import { route } from '@owlmeans/client-route'

// Create a module for client-side navigation
const profileModule = module(
  route('profile', '/profile/:id'),
  ({ ref }) => async (req, res) => {
    const url = ref.getPath()
    // Custom navigation logic
    window.history.pushState({}, '', url)
    res.resolve(url, ModuleOutcome.Ok)
  }
)

// Generate URL and navigate
const [url, outcome] = await profileModule.call({
  params: { id: '123' }
})
```

### Module Elevation

```typescript
import { elevate } from '@owlmeans/client-module'
import { basicModules } from './basic-modules'

// Elevate multiple modules for client-side use
const clientModules = [
  ...elevate(basicModules, 'users', { validateOnCall: true }),
  ...elevate(basicModules, 'posts', { validateOnCall: false })
]
```

### Complex Module with Guards and Gates

```typescript
import { module, guard, gate } from '@owlmeans/client-module'
import { route } from '@owlmeans/client-route'

// Create a protected module
const adminModule = module(
  route('admin-users', '/api/admin/users'),
  {
    guards: ['authenticated', 'admin'],
    gate: 'admin-access',
    gateParams: ['resource'],
    validateOnCall: true
  }
)

// The module will automatically check authentication and authorization
const [users, outcome] = await adminModule.call()
```

## Integration Patterns

### With React Components

```typescript
import { useEffect, useState } from 'react'
import { userModule } from './modules'

function UserProfile({ userId }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const [userData, outcome] = await userModule.call({
          params: { id: userId }
        })
        setUser(userData)
      } catch (error) {
        console.error('Failed to fetch user:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [userId])

  if (loading) return <div>Loading...</div>
  return <div>{user?.name}</div>
}
```

### With Context Configuration

```typescript
import { createContext } from '@owlmeans/client-context'
import { module } from '@owlmeans/client-module'

// Create context with API configuration
const context = createContext({
  webService: {
    default: 'api-service',
    users: 'user-service'
  }
})

// Create module with context
const userModule = module(route('users', '/api/users'))
userModule.ctx = context

// The module will use the configured API service
const [users, outcome] = await userModule.call()
```

### Error Handling

```typescript
import { ClientValidationError } from '@owlmeans/client-module'

try {
  await userModule.validate({
    body: { invalidData: true }
  })
} catch (error) {
  if (error instanceof ClientValidationError) {
    console.error('Validation failed:', error.message)
  } else {
    console.error('Unexpected error:', error)
  }
}
```

## Error Types

### ClientModuleError
Base error class for client module errors.

```typescript
class ClientModuleError extends ResilientError {
  constructor(message: string)
}
```

### ClientValidationError
Thrown when request validation fails.

```typescript
class ClientValidationError extends ClientModuleError {
  constructor(message: string)
}
```

## Best Practices

1. **Use Validation**: Enable `validateOnCall` for modules that accept user input
2. **Handle Errors**: Always wrap API calls in try-catch blocks
3. **Modular Design**: Create separate modules for different API endpoints
4. **Context Integration**: Use contexts to configure API services and authentication
5. **Type Safety**: Provide generic types for request/response data
6. **Route Reuse**: Elevate existing basic modules rather than creating new ones when possible

## Dependencies

This package depends on:
- `@owlmeans/module` - Core module system
- `@owlmeans/client-route` - Client-side routing
- `@owlmeans/client-context` - Client context management
- `@owlmeans/client-config` - Client configuration
- `@owlmeans/api` - API client functionality
- `ajv` - JSON schema validation

## Related Packages

- [`@owlmeans/module`](../module) - Core module system
- [`@owlmeans/client-route`](../client-route) - Client-side routing
- [`@owlmeans/client-context`](../client-context) - Client context management
- [`@owlmeans/server-module`](../server-module) - Server-side module system