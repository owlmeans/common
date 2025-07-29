# @owlmeans/client-context

Client-side context management for OwlMeans Common applications. This package extends the basic context system with client-specific functionality including service routing, API client integration, and configuration management designed for frontend applications.

## Overview

The `@owlmeans/client-context` package provides client-side context management for the OwlMeans ecosystem, offering:

- **Client Context Factory**: Creates contexts specifically configured for frontend applications
- **Service Route Management**: Manages service routes and API endpoints for client-server communication
- **API Client Integration**: Automatic integration with the OwlMeans API client system
- **Configuration Management**: Client-specific configuration with service definitions and i18n support
- **Frontend Context Utilities**: Helper functions for managing client application contexts

This package follows the OwlMeans "quadra" pattern as a client-side implementation extending the basic `@owlmeans/context` package.

## Installation

```bash
npm install @owlmeans/client-context
```

## Dependencies

This package requires and integrates with:
- `@owlmeans/context`: Base context management system
- `@owlmeans/client-config`: Client configuration management
- `@owlmeans/api`: API client integration
- `@owlmeans/route`: Service route definitions
- `@owlmeans/i18n`: Internationalization support

## Core Concepts

### Client Context

A client context is a specialized application context that manages client-side dependencies, service routes, and API communication. It extends the basic context with client-specific functionality.

### Service Routes

Service routes define how the client communicates with backend services, including endpoint definitions, authentication requirements, and communication protocols.

### Configuration Management

Client contexts handle configuration specific to frontend applications, including service definitions, internationalization settings, and client-specific parameters.

## API Reference

### Types

#### `ClientConfig`
Configuration interface for client contexts extending BasicClientConfig.

```typescript
interface ClientConfig extends BasicClientConfig {
  services: Record<string, CommonServiceRoute>  // Service route definitions
  i18n?: I18nConfig                            // Internationalization configuration
}
```

#### `ClientContext<C>`
Main client context interface extending BasicContext with client-specific functionality.

```typescript
interface ClientContext<C extends ClientConfig = ClientConfig> extends BasicContext<C>, ConfigResourceAppend {
  serviceRoute: (alias: string, makeDefault?: boolean) => CommonServiceRoute
}
```

**Methods:**
- **`serviceRoute(alias: string, makeDefault?: boolean): CommonServiceRoute`**: Retrieves service route by alias and optionally sets as default

### Factory Functions

#### `makeClientContext<C, T>(cfg: C): T`

Creates a client context instance with automatic API client integration.

**Parameters:**
- `cfg`: Client configuration object

**Returns:** ClientContext instance

**Features:**
- Automatically integrates API client
- Sets up service route management
- Configures context for frontend operation

**Example:**
```typescript
import { makeClientContext, config } from '@owlmeans/client-context'

// Create client configuration
const clientConfig = config('my-app', {
  services: {
    'user-service': {
      alias: 'user-service',
      route: {
        alias: 'users',
        path: '/api/users',
        service: 'user-service'
      }
    }
  }
})

// Create client context
const context = makeClientContext(clientConfig)

await context.configure().init()

// Access service route
const userService = context.serviceRoute('user-service')
```

#### `config<C>(service: string, cfg?: Partial<C>): C`

Creates a client configuration with default frontend settings.

**Parameters:**
- `service`: Service name identifier
- `cfg` (optional): Additional configuration options

**Returns:** ClientConfig object configured for frontend

**Example:**
```typescript
import { config } from '@owlmeans/client-context'

const clientConfig = config('frontend-app', {
  layer: Layer.Service,
  services: {
    'api': {
      alias: 'api',
      route: {
        alias: 'api',
        path: '/api',
        service: 'backend'
      }
    }
  },
  i18n: {
    defaultLng: 'en',
    defaultNs: 'translation'
  }
})
```

### Service Route Management

#### `serviceRoute(alias: string, makeDefault?: boolean): CommonServiceRoute`

Retrieves and manages service routes for API communication.

**Parameters:**
- `alias`: Service route alias
- `makeDefault` (optional): Whether to mark this route as default

**Returns:** CommonServiceRoute object

**Throws:** `SyntaxError` if service route not found

**Example:**
```typescript
// Get service route
const apiRoute = context.serviceRoute('api')

// Set as default service
const defaultRoute = context.serviceRoute('main-api', true)

// Use route for API calls
const apiClient = context.service('api-client')
await apiClient.call(apiRoute, 'users', { method: 'GET' })
```

### Constants

#### `PLUGINS`
Constant for plugin configuration.

```typescript
const PLUGINS = 'plugins'
```

## Usage Examples

### Basic Client Context Setup

```typescript
import { makeClientContext, config } from '@owlmeans/client-context'
import { Layer } from '@owlmeans/context'

// Create configuration with service routes
const clientConfig = config('web-app', {
  layer: Layer.User,
  services: {
    'auth-service': {
      alias: 'auth',
      route: {
        alias: 'auth',
        path: '/api/auth',
        service: 'auth-backend'
      }
    },
    'user-service': {
      alias: 'users',
      route: {
        alias: 'users',
        path: '/api/users',
        service: 'user-backend'
      }
    }
  }
})

// Create and initialize context
const context = makeClientContext(clientConfig)
await context.configure().init()

// Access services and routes
const authRoute = context.serviceRoute('auth-service')
const userRoute = context.serviceRoute('user-service')
```

### API Integration

```typescript
// Context automatically includes API client
const apiClient = context.service('api-client')

// Use service routes for API calls
const authRoute = context.serviceRoute('auth-service')
const response = await apiClient.call(authRoute, 'login', {
  method: 'POST',
  body: { username: 'user', password: 'pass' }
})

// Handle different services
const userRoute = context.serviceRoute('user-service', true) // Set as default
const users = await apiClient.call(userRoute, 'list', { method: 'GET' })
```

### Internationalization Integration

```typescript
const clientConfig = config('i18n-app', {
  services: { /* service definitions */ },
  i18n: {
    defaultLng: 'en',
    defaultNs: 'app',
    resources: {
      en: {
        app: {
          title: 'My Application',
          welcome: 'Welcome to our app'
        }
      }
    }
  }
})

const context = makeClientContext(clientConfig)
await context.configure().init()

// i18n is automatically configured and available
```

### Multi-Service Configuration

```typescript
const multiServiceConfig = config('complex-app', {
  services: {
    'auth': {
      alias: 'auth',
      route: {
        alias: 'auth',
        path: '/api/auth',
        service: 'auth-service'
      }
    },
    'users': {
      alias: 'users', 
      route: {
        alias: 'users',
        path: '/api/users',
        service: 'user-service'
      }
    },
    'orders': {
      alias: 'orders',
      route: {
        alias: 'orders',
        path: '/api/orders',
        service: 'order-service'  
      }
    }
  }
})

const context = makeClientContext(multiServiceConfig)
await context.configure().init()

// Access different service routes
const authRoute = context.serviceRoute('auth')
const userRoute = context.serviceRoute('users')
const orderRoute = context.serviceRoute('orders')

// Use with API client
const apiClient = context.service('api-client')
await apiClient.call(authRoute, 'me')
await apiClient.call(userRoute, 'profile')
await apiClient.call(orderRoute, 'recent')
```

### Context with Resource Configuration

```typescript
import { config } from '@owlmeans/client-context'

const resourceConfig = config('resource-app', {
  services: {
    'storage': {
      alias: 'storage',
      route: {
        alias: 'storage',
        path: '/api/storage',
        service: 'storage-service'
      }
    }
  },
  // Additional resource configuration
  resources: [{
    alias: 'local-storage',
    type: 'storage',
    config: {
      provider: 'localStorage'
    }
  }]
})

const context = makeClientContext(resourceConfig)
await context.configure().init()

// Access both service routes and resources
const storageRoute = context.serviceRoute('storage')
const localStorage = context.resource('local-storage')
```

### Service Route Error Handling

```typescript
try {
  const route = context.serviceRoute('non-existent-service')
} catch (error) {
  if (error instanceof SyntaxError && error.message.includes('Service not found')) {
    console.error('Service route not configured')
    // Handle missing service configuration
  }
}

// Safe service route access
const hasUserService = 'user-service' in context.cfg.services
if (hasUserService) {
  const userRoute = context.serviceRoute('user-service')
  // Use the route safely
}
```

### Default Service Management

```typescript
// Set a service as default
const primaryApi = context.serviceRoute('primary-api', true)

// The service is now marked as default
console.log(primaryApi.default) // true

// Other services remain non-default unless explicitly set
const secondaryApi = context.serviceRoute('secondary-api')
console.log(secondaryApi.default) // false or undefined
```

## Configuration

Client configuration supports various options for frontend applications:

```typescript
interface ClientConfig extends BasicClientConfig {
  // Service route definitions
  services: Record<string, CommonServiceRoute>
  
  // Internationalization settings
  i18n?: {
    defaultLng?: string
    defaultNs?: string
    resources?: Record<string, Record<string, any>>
  }
  
  // Additional client-specific configuration
  // (inherited from BasicClientConfig)
}
```

### Service Route Configuration

```typescript
interface CommonServiceRoute {
  alias: string                    // Service route alias
  route: {
    alias: string                  // Route alias
    path: string                   // API endpoint path
    service: string                // Backend service identifier
    method?: string                // HTTP method
    // Additional route configuration
  }
  default?: boolean                // Whether this is the default service
}
```

## Error Handling

The package provides descriptive error messages:

- **Service not found**: Thrown when accessing non-configured service routes
- **Configuration errors**: Thrown during context initialization with invalid config

```typescript
try {
  const context = makeClientContext(invalidConfig)
  await context.configure().init()
} catch (error) {
  console.error('Context initialization failed:', error)
}
```

## Integration with OwlMeans Ecosystem

This package integrates with:

- **@owlmeans/context**: Base context management system
- **@owlmeans/api**: API client for service communication  
- **@owlmeans/client-config**: Client configuration management
- **@owlmeans/route**: Service route definitions
- **@owlmeans/i18n**: Internationalization support

## Best Practices

1. **Define all service routes** in configuration for proper API communication
2. **Use meaningful service aliases** for easy identification
3. **Configure i18n settings** for internationalized applications
4. **Handle service route errors** gracefully with try-catch blocks
5. **Set default services** appropriately for primary API endpoints

## Related Packages

- **@owlmeans/server-context**: Server-side context management
- **@owlmeans/context**: Base context system
- **@owlmeans/api**: API client integration
- **@owlmeans/client-config**: Client configuration
- **@owlmeans/route**: Route management

## Utilities

The package also provides utility functions in the `/utils` subpackage for advanced context management and configuration operations.

```typescript
import { /* utility functions */ } from '@owlmeans/client-context/utils'
```

## TypeScript Support

The package is written in TypeScript and provides comprehensive type definitions for all client context operations, ensuring type safety for service routes, configuration, and API integration.