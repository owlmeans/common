# @owlmeans/server-context

Server-side context and dependency injection system for OwlMeans Common applications. This package extends the base OwlMeans context system with server-specific functionality, configuration management, and authentication capabilities for building secure backend services.

## Overview

The `@owlmeans/server-context` package provides server-specific extensions to the OwlMeans context system, offering:

- **Server Context Management**: Enhanced context with server-specific capabilities
- **Configuration Integration**: Built-in configuration resource management
- **Authentication Guards**: Pre-configured Ed25519 authentication guards
- **Middleware System**: Server-optimized middleware for request processing
- **Service Registration**: Streamlined service registration for server components
- **File Configuration**: File-based configuration reading capabilities
- **Security Defaults**: Secure-by-default configuration for production servers

## Installation

```bash
npm install @owlmeans/server-context
```

## Core Concepts

### Server Context

The `ServerContext` extends the basic OwlMeans context with server-specific functionality, including configuration resource management and enhanced service capabilities.

### Server Configuration

The `ServerConfig` combines server and client configuration options, providing a unified configuration structure for fullstack applications.

### Security Integration

Built-in integration with authentication guards and middleware for secure service-to-service communication.

## API Reference

### Types

#### `ServerConfig`
Extended configuration interface for server applications.

```typescript
interface ServerConfig extends BasicServerConfig, BasicClientConfig {
  services: Record<string, ServiceRoute>
}
```

#### `ServerContext<C extends ServerConfig>`
Enhanced context interface with server capabilities.

```typescript
interface ServerContext<C extends ServerConfig> extends BasicContext<C>, ConfigResourceAppend {
  // Inherits all BasicContext functionality plus configuration resource management
}
```

### Factory Functions

#### `makeServerContext<C, T>(cfg: C): T`
Creates a server context with enhanced capabilities.

**Parameters:**
- `cfg`: Server configuration object

**Returns:** Configured server context instance

**Features:**
- Registers file configuration reader middleware
- Adds configuration resource management
- Sets up trusted entity resource
- Configures plugin resource management
- Registers Ed25519 authentication guard
- Adds authentication middleware

#### `config<C>(service: string, cfg?: Partial<C>): C`
Creates a server configuration with default settings.

**Parameters:**
- `service`: Service name identifier
- `cfg`: Optional partial configuration

**Returns:** Complete server configuration

## Usage Examples

### Basic Server Setup

```typescript
import { makeServerContext, config } from '@owlmeans/server-context'

// Create server configuration
const serverConfig = config('my-service', {
  port: 3000,
  host: 'localhost',
  services: {
    database: {
      protocol: 'mongodb',
      host: 'localhost',
      port: 27017
    }
  }
})

// Create server context
const context = makeServerContext(serverConfig)

// Initialize the context
await context.init()
```

### Configuration with Resources

```typescript
import { makeServerContext, config } from '@owlmeans/server-context'

const serverConfig = config('api-server', {
  // Database configurations
  dbs: [
    {
      service: 'mongo',
      alias: 'primary',
      host: 'localhost',
      port: 27017,
      schema: 'myapp'
    }
  ],
  
  // Trusted services for authentication
  trusted: [
    {
      id: 'internal-service',
      recordType: 'trusted-source',
      name: 'Internal Service',
      entityId: 'internal',
      scopes: ['api:*']
    }
  ],
  
  // Service routes
  services: {
    'user-service': {
      protocol: 'https',
      host: 'user-service.internal',
      port: 443
    },
    'auth-service': {
      protocol: 'https', 
      host: 'auth-service.internal',
      port: 443
    }
  }
})

const context = makeServerContext(serverConfig)
```

### Service Registration

```typescript
import { makeServerContext, config } from '@owlmeans/server-context'
import { createDbService } from '@owlmeans/mongo'

const context = makeServerContext(config('my-service'))

// Register database service
const dbService = createDbService('primary')
context.registerService(dbService)

// Register custom service
const customService = {
  alias: 'custom-logic',
  initialized: false,
  init: async () => {
    console.log('Custom service initialized')
    return true
  }
}
context.registerService(customService)
```

### Authentication Setup

```typescript
import { makeServerContext, config } from '@owlmeans/server-context'

const serverConfig = config('secure-service', {
  trusted: [
    {
      id: 'client-app',
      recordType: 'trusted-source',
      name: 'Client Application',
      credential: 'base64-encoded-public-key',
      scopes: ['read', 'write']
    }
  ]
})

const context = makeServerContext(serverConfig)

// The Ed25519 guard is automatically registered
// Authentication middleware is automatically added
// Requests with valid signatures will be authenticated
```

### Custom Middleware Registration

```typescript
import { makeServerContext, config } from '@owlmeans/server-context'
import { MiddlewareType, MiddlewareStage } from '@owlmeans/context'

const context = makeServerContext(config('my-service'))

// Add custom middleware
context.registerMiddleware({
  type: MiddlewareType.Context,
  stage: MiddlewareStage.Loading,
  apply: async (ctx) => {
    console.log('Custom middleware executed')
    // Custom logic here
  }
})
```

### Configuration File Reading

```typescript
// config.json
{
  "service": "file-config-service",
  "port": 8080,
  "dbs": [
    {
      "service": "mongo",
      "host": "mongodb://localhost:27017",
      "schema": "production"
    }
  ]
}
```

```typescript
import { makeServerContext } from '@owlmeans/server-context'

// File configuration is automatically read via middleware
const context = makeServerContext({} as any)

// Configuration will be populated from files
await context.init()

// Access configuration
const config = context.cfg
console.log(`Service running on port ${config.port}`)
```

### Resource Management

```typescript
import { makeServerContext, config } from '@owlmeans/server-context'

const context = makeServerContext(config('resource-service'))

// Access configuration resources
const configResource = context.getConfigResource()
const trustedResource = context.getConfigResource('trusted')
const pluginResource = context.getConfigResource('plugin')

// Create new configuration records
await configResource.create({
  id: 'feature-flag',
  recordType: 'feature',
  enabled: true,
  description: 'Enable new feature'
})

// Query trusted entities
const trustedEntities = await trustedResource.list({
  criteria: { scopes: ['admin'] }
})
```

### Plugin System Integration

```typescript
import { makeServerContext, config } from '@owlmeans/server-context'

const serverConfig = config('plugin-host', {
  plugins: [
    {
      id: 'auth-plugin',
      recordType: 'plugin',
      name: 'Authentication Plugin',
      version: '1.0.0',
      enabled: true,
      config: {
        provider: 'oauth2',
        clientId: 'app-client-id'
      }
    }
  ]
})

const context = makeServerContext(serverConfig)

// Access plugin configuration
const pluginResource = context.getConfigResource('plugin')
const authPlugin = await pluginResource.get('auth-plugin')

if (authPlugin.enabled) {
  // Initialize plugin
  console.log(`Loading ${authPlugin.name} v${authPlugin.version}`)
}
```

### Multi-Service Architecture

```typescript
import { makeServerContext, config } from '@owlmeans/server-context'

// Gateway service configuration
const gatewayConfig = config('api-gateway', {
  services: {
    'user-service': {
      protocol: 'http',
      host: 'user-service',
      port: 3001
    },
    'order-service': {
      protocol: 'http', 
      host: 'order-service',
      port: 3002
    },
    'payment-service': {
      protocol: 'https',
      host: 'payment-service.external',
      port: 443
    }
  },
  
  trusted: [
    {
      id: 'user-service',
      recordType: 'trusted-source',
      name: 'User Service',
      scopes: ['users:*']
    },
    {
      id: 'order-service', 
      recordType: 'trusted-source',
      name: 'Order Service',
      scopes: ['orders:*', 'users:read']
    }
  ]
})

const gateway = makeServerContext(gatewayConfig)

// Service can now route to other services with authentication
```

### Error Handling

```typescript
import { makeServerContext, config } from '@owlmeans/server-context'

try {
  const context = makeServerContext(config('error-service'))
  await context.init()
} catch (error) {
  console.error('Failed to initialize server context:', error)
  
  // Handle specific initialization errors
  if (error.message.includes('database')) {
    console.error('Database connection failed')
  } else if (error.message.includes('config')) {
    console.error('Configuration error')
  }
  
  process.exit(1)
}
```

## Advanced Features

### Custom Context Extensions

```typescript
import { makeServerContext, ServerContext, ServerConfig } from '@owlmeans/server-context'

interface CustomConfig extends ServerConfig {
  customFeature: boolean
  apiKeys: string[]
}

interface CustomContext extends ServerContext<CustomConfig> {
  customMethod: () => void
}

const createCustomContext = (cfg: CustomConfig): CustomContext => {
  const context = makeServerContext(cfg) as CustomContext
  
  context.customMethod = () => {
    console.log('Custom context method')
  }
  
  return context
}
```

### Dynamic Service Discovery

```typescript
import { makeServerContext, config } from '@owlmeans/server-context'

const context = makeServerContext(config('discovery-service'))

// Dynamic service registration
const discoverServices = async () => {
  const services = await fetchAvailableServices()
  
  services.forEach(service => {
    context.cfg.services[service.name] = {
      protocol: service.protocol,
      host: service.host,
      port: service.port
    }
  })
}

await discoverServices()
```

### Health Checks

```typescript
import { makeServerContext, config } from '@owlmeans/server-context'

const context = makeServerContext(config('health-service'))

const healthCheck = async () => {
  try {
    // Check all registered services
    const services = Object.keys(context.cfg.services)
    const healthStatuses = await Promise.all(
      services.map(async service => {
        try {
          await context.service(service)
          return { service, status: 'healthy' }
        } catch (error) {
          return { service, status: 'unhealthy', error: error.message }
        }
      })
    )
    
    return healthStatuses
  } catch (error) {
    return { status: 'error', message: error.message }
  }
}
```

## Integration with OwlMeans Ecosystem

The `@owlmeans/server-context` package integrates with:

- **@owlmeans/context**: Base context and dependency injection system
- **@owlmeans/config**: Configuration management and resource handling
- **@owlmeans/server-config**: Server-specific configuration structures
- **@owlmeans/client-config**: Client configuration for fullstack apps
- **@owlmeans/server-route**: Service routing and discovery
- **@owlmeans/auth-common**: Authentication middleware and guards
- **@owlmeans/mongo**: Database service integration
- **@owlmeans/redis**: Cache service integration

## Security Features

### Built-in Authentication
- Ed25519 signature-based authentication guard
- Automatic authentication middleware
- Trusted entity management
- Secure service-to-service communication

### Configuration Security
- Secure file configuration reading
- Environment variable support
- Secret management integration
- Access control for configuration resources

## Best Practices

### Configuration Management
- Use environment-specific configuration files
- Store secrets in secure environment variables
- Implement configuration validation
- Use typed configuration interfaces

### Service Architecture
- Register services during context initialization
- Implement proper service lifecycle management
- Use dependency injection for service access
- Handle service failures gracefully

### Security
- Always use authentication guards for protected services
- Implement proper authorization checks
- Validate all incoming requests
- Use secure communication protocols

### Performance
- Initialize context once during application startup
- Cache frequently accessed configuration
- Use lazy service initialization where appropriate
- Monitor resource usage and optimize accordingly

Fixes #32.