# @owlmeans/api-config-server

The **@owlmeans/api-config-server** package provides server-side functionality for advertising API configuration to clients in OwlMeans Common Libraries, designed for fullstack microservices and microclients development with focus on security and proper authentication and authorization.

## Purpose

This package serves as the server-side component of the OwlMeans configuration system that:

- **Advertises service configuration** to clients through API endpoints
- **Filters sensitive information** before sending configuration to clients
- **Supports multi-service architecture** by exposing service endpoint information
- **Integrates with server modules** for seamless API endpoint creation
- **Provides secure configuration sharing** with proper filtering of secrets and internal data

## Core Concepts

### Configuration Advertisement
The server advertises its configuration to clients through a REST API endpoint, allowing clients to discover available services, their endpoints, and relevant configuration data.

### Information Filtering
The package carefully filters configuration data to ensure sensitive information (like secrets, API keys, and internal configurations) is not exposed to clients.

### Service Discovery
Clients can discover all available services, their hosts, ports, and base paths through the configuration API, enabling dynamic service discovery.

### Plugin and Record Sharing
The server can share frontend-compatible plugins and allowed configuration records with clients.

## API Reference

### Modules

#### `modules`

Exported server modules array containing the elevated API config module with server-side handler.

```typescript
import { modules } from '@owlmeans/api-config-server'

// Register all server API config modules
context.registerModules(modules)
```

### Actions

#### `advertise`

The main action handler that processes API configuration requests and returns filtered configuration.

```typescript
import { advertise } from '@owlmeans/api-config-server'

// This handler is automatically attached to the API config module
// It processes requests and returns filtered configuration
```

**Returns:** `ApiConfig` object containing:
- `debug`: Debug configuration (filtered)
- `brand`: Branding information
- `services`: Service endpoint information (host, port, base, service name, type)
- `plugins`: Frontend-compatible plugins
- `[CONFIG_RECORD]`: Allowed configuration records
- `oidc`: OIDC configuration (filtered, no secrets)
- Additional safe configuration fields

**Filtering Behavior:**
- Removes sensitive keys defined in `notAdvertizedConfigKeys`
- Filters service configurations to include only public information
- Removes secrets from OIDC configuration
- Only includes frontend-compatible plugins
- Only includes allowed configuration record types

## Configuration Filtering

The package implements strict filtering to protect sensitive information:

### Service Information
From each service configuration, only these fields are shared:
- `service`: Service name
- `type`: Service type (Frontend/Backend)
- `host`: Service host
- `port`: Service port
- `base`: Base path

### OIDC Configuration
For OIDC configuration, sensitive fields are filtered out:
- **Removed**: `secret`, `apiClientId`
- **Kept**: `clientCookie`, public provider information
- **Internal providers**: Completely filtered out (where `internal: true`)

### Plugin Filtering
Only plugins marked as `AppType.Frontend` are included in the advertised configuration.

### Configuration Records
Only configuration records with types listed in `allowedConfigRecords` are shared with clients.

## Usage Examples

### Basic Server Setup

```typescript
import { makeServerContext, makeServerConfig } from '@owlmeans/server-context'
import { modules } from '@owlmeans/api-config-server'
import { AppType } from '@owlmeans/context'

// Create server configuration
const config = makeServerConfig(AppType.Backend, 'config-server', {
  host: 'localhost',
  port: 3000,
  services: {
    'user-service': {
      service: 'user-service',
      type: AppType.Backend,
      host: 'users.api.com',
      port: 8080,
      base: '/api/v1'
    },
    'auth-service': {
      service: 'auth-service', 
      type: AppType.Backend,
      host: 'auth.api.com',
      port: 8081,
      secret: 'very-secret-key' // This will be filtered out
    }
  },
  debug: { all: true }
})

// Create and configure context
const context = makeServerContext(config)

// Register API config modules
context.registerModules(modules)

// Configure and initialize
context.configure()
await context.init()

// API config endpoint is now available at the configured route
```

### Integration with Express

```typescript
import express from 'express'
import { modules } from '@owlmeans/api-config-server'
import { API_CONFIG } from '@owlmeans/api-config'

const app = express()

// After context initialization
const configModule = context.module(API_CONFIG)

// The module has a handler that returns filtered configuration
app.get('/api/config', async (req, res) => {
  try {
    // The advertise handler is automatically attached
    const request = adaptExpressRequest(req)
    const response = provideResponse()
    
    await configModule.handle(request, response)
    
    if (response.error) {
      res.status(500).json({ error: response.error.message })
    } else {
      res.json(response.value)
    }
  } catch (error) {
    res.status(500).json({ error: 'Configuration unavailable' })
  }
})
```

### Custom Configuration Filtering

```typescript
import { makeServerConfig } from '@owlmeans/server-context'
import { modules } from '@owlmeans/api-config-server'

const config = makeServerConfig(AppType.Backend, 'api-server', {
  // Public configuration (will be shared)
  brand: {
    name: 'My Application',
    version: '1.0.0'
  },
  
  // Service configuration (filtered)
  services: {
    'payment-service': {
      service: 'payment-service',
      type: AppType.Backend,
      host: 'payments.api.com',
      port: 443,
      apiKey: 'secret-api-key', // Will be filtered out
      publicEndpoint: '/api/v1' // Will be included as 'base'
    }
  },
  
  // OIDC configuration (partially filtered)
  oidc: {
    clientCookie: 'session-cookie', // Will be shared
    providers: [
      {
        name: 'google',
        clientId: 'public-client-id', // Will be shared
        secret: 'client-secret', // Will be filtered out
        issuer: 'https://accounts.google.com'
      },
      {
        name: 'internal-auth',
        internal: true, // Entire provider will be filtered out
        clientId: 'internal-client',
        secret: 'internal-secret'
      }
    ]
  },
  
  // Plugins (only frontend plugins shared)
  plugins: [
    {
      name: 'frontend-plugin',
      type: AppType.Frontend,
      config: { theme: 'dark' }
    },
    {
      name: 'backend-plugin', 
      type: AppType.Backend,
      config: { database: 'secret-connection' } // Will be filtered out
    }
  ]
})
```

### Multi-Service Architecture

```typescript
const config = makeServerConfig(AppType.Backend, 'gateway-server', {
  services: {
    'user-service': {
      service: 'user-service',
      type: AppType.Backend,
      host: 'users.internal.com',
      port: 8080,
      base: '/users'
    },
    'order-service': {
      service: 'order-service', 
      type: AppType.Backend,
      host: 'orders.internal.com',
      port: 8081,
      base: '/orders'
    },
    'notification-service': {
      service: 'notification-service',
      type: AppType.Backend, 
      host: 'notifications.internal.com',
      port: 8082,
      base: '/notifications'
    }
  }
})

const context = makeServerContext(config)
context.registerModules(modules)
await context.configure().init()

// Clients can now discover all services through the config API
```

## Security Considerations

### Information Filtering
The package implements multiple layers of security:

1. **Automatic Secret Filtering** - Known secret fields are automatically removed
2. **Service Information Limiting** - Only essential service discovery information is shared
3. **OIDC Security** - Client secrets and internal configurations are filtered
4. **Plugin Type Filtering** - Only frontend-compatible plugins are shared
5. **Configuration Record Filtering** - Only explicitly allowed record types are shared

### Best Practices

1. **Minimize exposed information** - Only include necessary configuration in server config
2. **Use environment variables** - Store secrets in environment variables, not configuration
3. **Implement authentication** - Protect the config endpoint with appropriate authentication
4. **Monitor access** - Log and monitor who accesses configuration endpoints
5. **Regular security audits** - Review what information is being exposed

### Example Security Setup

```typescript
import { modules } from '@owlmeans/api-config-server'
import { authenticatedGuard } from '@owlmeans/server-auth'

// Protect configuration endpoint with authentication
const configModule = context.module(API_CONFIG)
configModule.guards = ['authenticated']

// Or use custom middleware for additional security
app.get('/api/config', authenticateRequest, async (req, res) => {
  // Only authenticated clients can access configuration
})
```

## Integration Patterns

### Microservices Gateway

```typescript
// Gateway server that advertises all microservice endpoints
const gatewayConfig = makeServerConfig(AppType.Backend, 'api-gateway', {
  services: {
    ...userServiceConfig,
    ...orderServiceConfig,
    ...paymentServiceConfig,
    ...notificationServiceConfig
  }
})

// Clients connect to gateway and get all service information
```

### Development vs Production

```typescript
const isDevelopment = process.env.NODE_ENV === 'development'

const config = makeServerConfig(AppType.Backend, 'api-server', {
  debug: isDevelopment ? { all: true } : {},
  services: {
    'user-service': {
      service: 'user-service',
      type: AppType.Backend,
      host: isDevelopment ? 'localhost' : 'users.prod.com',
      port: isDevelopment ? 3001 : 443,
      base: '/api/v1'
    }
  }
})
```

## Error Handling

The package handles configuration errors gracefully:

- **Missing configuration** - Returns empty or default values
- **Invalid service configs** - Filters out malformed service entries
- **Plugin errors** - Continues processing even if plugin filtering fails
- **OIDC parsing errors** - Falls back to basic configuration

## Related Packages

- [`@owlmeans/api-config`](../api-config) - Common API config module definitions
- [`@owlmeans/api-config-client`](../api-config-client) - Client-side configuration fetching
- [`@owlmeans/server-context`](../server-context) - Server-side context management
- [`@owlmeans/server-module`](../server-module) - Server-side module system
- [`@owlmeans/config`](../config) - Configuration management utilities

## Dependencies

This package depends on:
- `@owlmeans/api-config` - Common API config definitions and constants
- `@owlmeans/server-module` - Server-side module elevation and handling
- `@owlmeans/server-context` - Server context types and configuration
- `@owlmeans/server-api` - Request handling utilities
- `@owlmeans/config` - Configuration management and plugin types
- `@owlmeans/context` - Core context functionality and types