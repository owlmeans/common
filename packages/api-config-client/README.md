# @owlmeans/api-config-client

The **@owlmeans/api-config-client** package provides client-side functionality for fetching and applying API configuration from OwlMeans Common Libraries servers, designed for fullstack microservices and microclients development with focus on security and proper authentication and authorization.

## Purpose

This package serves as the client-side component of the OwlMeans configuration system that:

- **Fetches configuration from servers** using the API config module system
- **Applies configuration dynamically** to client contexts during initialization
- **Integrates with client modules** for seamless API communication
- **Supports multi-service architecture** with configurable primary hosts
- **Provides middleware integration** for automatic configuration loading

## Core Concepts

### API Configuration Module
The package elevates the common API config module to a client module, enabling it to make HTTP requests to fetch configuration from servers.

### Configuration Middleware
Provides middleware that automatically fetches and merges server configuration during client context initialization, ensuring the client has the latest configuration before becoming operational.

### Primary Host Configuration
Supports configuration of primary hosts and ports for API communication, allowing clients to know where to fetch their configuration from.

## API Reference

### Modules

#### `modules`

Exported client modules array containing the elevated API config module.

```typescript
import { modules } from '@owlmeans/api-config-client'

// Register all client API config modules
context.registerModules(modules)
```

### Middleware

#### `apiConfigMiddleware`

Middleware that fetches configuration from the API config endpoint during context loading.

```typescript
import { apiConfigMiddleware } from '@owlmeans/api-config-client'

context.registerMiddleware(apiConfigMiddleware)
```

**Properties:**
- `type`: `MiddlewareType.Context`
- `stage`: `MiddlewareStage.Loading`

**Behavior:**
- Executes during the Loading stage of context initialization
- Checks if `primaryHost` is configured in the client config
- Fetches configuration from the API config module endpoint
- Merges received configuration with the existing client configuration
- Handles errors gracefully by logging them without breaking initialization

### Dependencies

The package depends on several OwlMeans Common packages:
- `@owlmeans/api-config` - Common API config module definitions
- `@owlmeans/client-context` - Client-side context management
- `@owlmeans/client-module` - Client-side module system
- `@owlmeans/context` - Core context functionality

## Usage Examples

### Basic Integration

```typescript
import { makeClientContext, makeClientConfig } from '@owlmeans/client-context'
import { modules, apiConfigMiddleware } from '@owlmeans/api-config-client'
import { AppType } from '@owlmeans/context'

// Create client configuration with primary host
const config = makeClientConfig(AppType.Frontend, 'web-client', {
  primaryHost: 'api.myapp.com',
  primaryPort: 443
})

// Create and configure context
const context = makeClientContext(config)

// Register API config middleware
context.registerMiddleware(apiConfigMiddleware)

// Register API config modules
context.registerModules(modules)

// Configure and initialize - configuration will be fetched automatically
context.configure()
await context.init()

// Context now has merged configuration from server
console.log('Final config:', await context.config)
```

### Manual Configuration Fetching

```typescript
import { modules } from '@owlmeans/api-config-client'
import { API_CONFIG } from '@owlmeans/api-config'

// Get the API config module
const configModule = context.module(API_CONFIG)

// Manually fetch configuration
try {
  const [serverConfig] = await configModule.call()
  console.log('Server configuration:', serverConfig)
} catch (error) {
  console.error('Failed to fetch configuration:', error)
}
```

### Advanced Configuration

```typescript
import { makeClientContext, makeClientConfig } from '@owlmeans/client-context'
import { modules, apiConfigMiddleware } from '@owlmeans/api-config-client'
import { AppType } from '@owlmeans/context'

const config = makeClientConfig(AppType.Frontend, 'mobile-client', {
  primaryHost: 'api.example.com',
  primaryPort: 8080,
  // Additional client configuration
  debug: { all: true },
  services: {
    'user-service': {
      host: 'users.example.com',
      port: 8081
    }
  }
})

const context = makeClientContext(config)

// Register middleware first
context.registerMiddleware(apiConfigMiddleware)

// Register modules
context.registerModules(modules)

// Add custom middleware to run after config is loaded
context.registerMiddleware({
  type: MiddlewareType.Context,
  stage: MiddlewareStage.Ready,
  apply: async (ctx) => {
    console.log('Configuration loaded and merged')
    const finalConfig = await ctx.config
    console.log('Available services:', Object.keys(finalConfig.services || {}))
  }
})

await context.configure().init()
```

### Error Handling

```typescript
import { modules, apiConfigMiddleware } from '@owlmeans/api-config-client'

// The middleware handles errors gracefully
context.registerMiddleware(apiConfigMiddleware)

// You can also add custom error handling
context.registerMiddleware({
  type: MiddlewareType.Context,
  stage: MiddlewareStage.Loading,
  apply: async (ctx) => {
    const clientCtx = ctx as ClientContext
    if (clientCtx.cfg.primaryHost) {
      try {
        const configModule = clientCtx.module(API_CONFIG)
        const [config] = await configModule.call()
        console.log('Successfully fetched config')
      } catch (error) {
        console.warn('Config fetch failed, using defaults:', error.message)
        // Implement fallback configuration logic
      }
    }
  }
})
```

### Multiple Service Configuration

```typescript
// Client can fetch configuration that includes multiple service endpoints
const config = makeClientConfig(AppType.Frontend, 'dashboard-client', {
  primaryHost: 'config.myapp.com'
})

const context = makeClientContext(config)
context.registerMiddleware(apiConfigMiddleware)
context.registerModules(modules)

await context.configure().init()

// After initialization, context will have configuration for all services
const finalConfig = await context.config
console.log('Auth service:', finalConfig.services?.auth)
console.log('User service:', finalConfig.services?.users)
console.log('Payment service:', finalConfig.services?.payments)
```

## Integration Patterns

### With React Applications

```typescript
import React from 'react'
import { ClientContext } from '@owlmeans/client-context'
import { modules, apiConfigMiddleware } from '@owlmeans/api-config-client'

const initializeApp = async () => {
  const config = makeClientConfig(AppType.Frontend, 'react-app', {
    primaryHost: process.env.REACT_APP_API_HOST
  })
  
  const context = makeClientContext(config)
  context.registerMiddleware(apiConfigMiddleware)
  context.registerModules(modules)
  
  await context.configure().init()
  return context
}

const App: React.FC = () => {
  const [context, setContext] = useState<ClientContext | null>(null)
  
  useEffect(() => {
    initializeApp().then(setContext)
  }, [])
  
  if (!context) return <div>Loading configuration...</div>
  
  return (
    <ClientContext.Provider value={context}>
      {/* Your app components */}
    </ClientContext.Provider>
  )
}
```

### With Service Workers

```typescript
// In service worker or background process
import { modules, apiConfigMiddleware } from '@owlmeans/api-config-client'

const setupBackgroundSync = async () => {
  const config = makeClientConfig(AppType.Frontend, 'sw-client', {
    primaryHost: self.registration.scope + 'api'
  })
  
  const context = makeClientContext(config)
  context.registerMiddleware(apiConfigMiddleware)
  context.registerModules(modules)
  
  await context.configure().init()
  
  // Now context has all service configurations for background operations
  return context
}
```

## Configuration Flow

1. **Context Creation** - Create client context with `primaryHost` configuration
2. **Middleware Registration** - Register `apiConfigMiddleware` to handle automatic config fetching
3. **Module Registration** - Register API config modules for communication
4. **Context Initialization** - During `init()`, middleware fetches server configuration
5. **Configuration Merge** - Server configuration is merged with local client configuration
6. **Ready State** - Context becomes ready with complete configuration

## Error Handling

The package handles various error scenarios:

- **Network failures** - Logged but don't prevent initialization
- **Invalid responses** - Gracefully handled with fallback to existing configuration
- **Missing primary host** - Middleware skips execution if no primary host configured
- **Module call failures** - Errors are caught and logged without breaking the initialization flow

## Best Practices

1. **Set primary host early** - Configure `primaryHost` in your client configuration
2. **Register middleware first** - Ensure middleware is registered before modules
3. **Handle initialization** - Always await context initialization before use
4. **Monitor errors** - Log and monitor configuration fetch failures
5. **Implement fallbacks** - Have default configurations ready for offline scenarios
6. **Secure communication** - Use HTTPS for production API config endpoints

## Security Considerations

- **Validate endpoints** - Ensure primary host is a trusted server
- **Handle secrets carefully** - Configuration may contain sensitive service information
- **Monitor traffic** - Log configuration requests for security auditing
- **Use authentication** - Combine with auth modules for secured configuration access

## Related Packages

- [`@owlmeans/api-config`](../api-config) - Common API config module definitions
- [`@owlmeans/api-config-server`](../api-config-server) - Server-side API config implementation
- [`@owlmeans/client-context`](../client-context) - Client-side context management
- [`@owlmeans/client-module`](../client-module) - Client-side module system